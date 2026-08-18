import {
  prisma,
  Prisma,
  FinancingStatus,
  InstallmentStatus,
  AccountType,
} from "@/infrastructure/prisma";
import { ForbiddenError, NotFoundError } from "@/shared/utils/AppError";
import { LedgerService } from "./ledger.service";
import { InstallmentService } from "./installment.service";
import { NotificationOrchestrator } from "@/infrastructure/internal_notification/notification.orchestrator";
import { NotificationEventType } from "@/infrastructure/internal_notification/notification.types";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import {
  RestructureContractSchema,
  WriteOffContractSchema,
} from "@/shared/schemas/financing.schema";
import type { z } from "zod";

type RestructureInput = z.infer<typeof RestructureContractSchema>;

export class FinancingService {
  static async restructureContract(
    contractId: string,
    adminUserId: string,
    newTerms: RestructureInput,
  ) {
    const validated = RestructureContractSchema.parse(newTerms);

    return prisma.$transaction(async (tx) => {
      const contract = await tx.financingContract.findUnique({
        where: { contractId },
        include: { installments: true, user: true, product: true },
      });

      if (!contract) throw new NotFoundError("Contract not found");
      if (contract.status !== FinancingStatus.DEFAULTED) {
        throw new ForbiddenError(
          "Only DEFAULTED contracts can be restructured",
        );
      }

      if (!contract.user) {
        throw new NotFoundError("Contract owner not found");
      }

      const caller = await tx.user.findUnique({
        where: { userId: adminUserId },
      });

      if (!caller || !["ADMIN", "COMPANY"].includes(caller.role)) {
        throw new ForbiddenError("Only admins can restructure contracts");
      }

      if (caller.companyId && contract.user.companyId !== caller.companyId) {
        throw new ForbiddenError(
          "You are not authorized to modify this contract",
        );
      }

      const paidAmount = contract.installments
        .filter((i) => i.status === InstallmentStatus.PAID)
        .reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));

      const remainingPrincipal = new Prisma.Decimal(
        contract.totalFinanced,
      ).minus(paidAmount);

      const newInterest = remainingPrincipal
        .times(validated.interestPercentage)
        .div(100);

      const newTotalFinanced = remainingPrincipal.plus(newInterest);

      await tx.financingContract.update({
        where: { contractId },
        data: {
          status: FinancingStatus.RESTRUCTURED,
          interest: newInterest,
          totalFinanced: newTotalFinanced,
          restructuredAt: new Date(),
          restructuredById: adminUserId,
        },
      });

      await tx.installment.updateMany({
        where: {
          financingContractId: contract.contractId,
          status: {
            in: [
              InstallmentStatus.PENDING,
              InstallmentStatus.DUE,
              InstallmentStatus.OVERDUE,
              InstallmentStatus.DEFAULTED,
            ],
          },
        },
        data: { status: InstallmentStatus.VOIDED },
      });

      const installmentSchedules =
        InstallmentService.generateInstallmentSchedule({
          financingContractId: contract.contractId,
          totalAmount: Number(newTotalFinanced),
          months: validated.numberOfInstallments,
          firstPaymentDate: validated.firstPaymentDate,
        });

      await tx.installment.createMany({
        data: installmentSchedules,
      });

      await LedgerService.recordTransaction(
        {
          reference: `RESTRUCTURE-${contractId}-${Date.now()}`,
          description: `Contract ${contractId} restructured by ${caller.name}`,
          companyId: contract.user.companyId || undefined,
          entries: [
            {
              accountName: "CUSTOMER_RECEIVABLE",
              accountType: AccountType.ASSET,
              debit: newTotalFinanced,
            },
            {
              accountName: "BAD_DEBT_RECOVERY",
              accountType: AccountType.REVENUE,
              credit: remainingPrincipal,
            },
            {
              accountName: "INTEREST_INCOME",
              accountType: AccountType.REVENUE,
              credit: newInterest,
            },
          ],
        },
        tx,
      );

      const customer = contract.user;
      const marketer = customer.referredByMarketerId
        ? await tx.user.findUnique({
            where: { userId: customer.referredByMarketerId },
            select: { userId: true, email: true, name: true },
          })
        : null;

      if (marketer) {
        await NotificationOrchestrator.handle(
          NotificationEventType.CONTRACT_RESTRUCTURED,
          {
            contractId,
            customerName: customer.name ?? "Customer",
            customerEmail: customer.email,
            newTotalFinanced: Number(newTotalFinanced),
            restructuredBy: caller.name ?? "Admin",
            restructuredAt: new Date().toISOString(),
            marketerId: marketer.userId,
            marketerEmail: marketer.email,
            marketerName: marketer.name ?? "Marketer",
          },
        );

        emitEvent(DomainEvent.CONTRACT_RESTRUCTURED, {
          contractId,
          customerName: customer.name ?? "Customer",
          newTotalFinanced: Number(newTotalFinanced),
          restructuredBy: caller.name ?? "Admin",
          restructuredAt: new Date().toISOString(),
          marketerEmail: marketer.email,
          marketerName: marketer.name ?? "Marketer",
          dashboard_url: process.env.FRONTEND_URL,
        });
      }

      return {
        contractId,
        newTotalFinanced: Number(newTotalFinanced),
        newInstallments: validated.numberOfInstallments,
        status: FinancingStatus.RESTRUCTURED,
      };
    });
  }

  // ─── Write Off a Defaulted or Restructured Contract ───
  static async writeOffContract(
    contractId: string,
    companyUserId: string,
    reason: string,
  ) {
    const validated = WriteOffContractSchema.parse({ reason });

    return prisma.$transaction(async (tx) => {
      const contract = await tx.financingContract.findUnique({
        where: { contractId },
        include: { installments: true, user: true },
      });

      if (!contract) throw new NotFoundError("Contract not found");
      if (
        contract.status !== FinancingStatus.DEFAULTED &&
        contract.status !== FinancingStatus.RESTRUCTURED
      ) {
        throw new ForbiddenError(
          "Only DEFAULTED or RESTRUCTURED contracts can be written off",
        );
      }

      if (!contract.user) {
        throw new NotFoundError("Contract owner not found");
      }

      const approver = await tx.user.findUnique({
        where: { userId: companyUserId },
      });

      if (!approver || approver.role !== "COMPANY") {
        throw new ForbiddenError(
          "Only company accounts can write off contracts",
        );
      }

      if (
        approver.companyId &&
        contract.user.companyId !== approver.companyId
      ) {
        throw new ForbiddenError(
          "You are not authorized to write off this contract",
        );
      }

      const paidAmount = contract.installments
        .filter((i) => i.status === InstallmentStatus.PAID)
        .reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));

      const outstandingAmount = new Prisma.Decimal(
        contract.totalFinanced,
      ).minus(paidAmount);

      await tx.financingContract.update({
        where: { contractId },
        data: {
          status: FinancingStatus.WRITTEN_OFF,
          writtenOffAt: new Date(),
          writtenOffById: companyUserId,
          writeOffReason: validated.reason,
        },
      });

      await tx.installment.updateMany({
        where: {
          financingContractId: contract.contractId,
          status: {
            in: [
              InstallmentStatus.PENDING,
              InstallmentStatus.DUE,
              InstallmentStatus.OVERDUE,
              InstallmentStatus.DEFAULTED,
            ],
          },
        },
        data: { status: InstallmentStatus.VOIDED },
      });

      await LedgerService.recordTransaction(
        {
          reference: `WRITEOFF-${contractId}-${Date.now()}`,
          description: `Contract ${contractId} written off: ${validated.reason}`,
          companyId: contract.user.companyId || undefined,
          entries: [
            {
              accountName: "BAD_DEBT_EXPENSE",
              accountType: AccountType.EXPENSE,
              debit: outstandingAmount,
            },
            {
              accountName: "CUSTOMER_RECEIVABLE",
              accountType: AccountType.ASSET,
              credit: outstandingAmount,
            },
          ],
        },
        tx,
      );

      const customer = contract.user;
      const marketer = customer.referredByMarketerId
        ? await tx.user.findUnique({
            where: { userId: customer.referredByMarketerId },
            select: {
              userId: true,
              email: true,
              name: true,
              createdById: true,
            },
          })
        : null;

      const admin = marketer?.createdById
        ? await tx.user.findUnique({
            where: { userId: marketer.createdById },
            select: { userId: true, email: true, name: true },
          })
        : null;

      const fallbackAdmin = await tx.user.findFirst({
        where: { role: "SUPER_ADMIN" },
        select: { userId: true, email: true, name: true },
      });

      const targetAdmin = admin ?? fallbackAdmin;

      if (marketer) {
        await NotificationOrchestrator.handle(
          NotificationEventType.CONTRACT_WRITTEN_OFF,
          {
            contractId,
            customerName: customer.name ?? "Customer",
            customerEmail: customer.email,
            outstandingAmount: Number(outstandingAmount),
            writeOffReason: validated.reason,
            writtenOffBy: approver.name ?? "Company",
            writtenOffAt: new Date().toISOString(),
            recipientRole: "MARKETER",
            recipientId: marketer.userId,
            recipientName: marketer.name ?? "Marketer",
            recipientEmail: marketer.email,
            companyId: contract.user.companyId || "",
          },
        );

        emitEvent(DomainEvent.CONTRACT_WRITTEN_OFF, {
          contractId,
          customerName: customer.name ?? "Customer",
          outstandingAmount: Number(outstandingAmount),
          writeOffReason: validated.reason,
          writtenOffBy: approver.name ?? "Company",
          writtenOffAt: new Date().toISOString(),
          recipientRole: "MARKETER",
          recipientName: marketer.name ?? "Marketer",
          recipientEmail: marketer.email,
          dashboard_url: process.env.FRONTEND_URL,
        });
      }

      if (targetAdmin) {
        await NotificationOrchestrator.handle(
          NotificationEventType.CONTRACT_WRITTEN_OFF,
          {
            contractId,
            customerName: customer.name ?? "Customer",
            customerEmail: customer.email,
            outstandingAmount: Number(outstandingAmount),
            writeOffReason: validated.reason,
            writtenOffBy: approver.name ?? "Company",
            writtenOffAt: new Date().toISOString(),
            recipientRole: "ADMIN",
            recipientId: targetAdmin.userId,
            recipientName: targetAdmin.name ?? "Admin",
            recipientEmail: targetAdmin.email,
            companyId: contract.user.companyId || "",
          },
        );

        emitEvent(DomainEvent.CONTRACT_WRITTEN_OFF, {
          contractId,
          customerName: customer.name ?? "Customer",
          outstandingAmount: Number(outstandingAmount),
          writeOffReason: validated.reason,
          writtenOffBy: approver.name ?? "Company",
          writtenOffAt: new Date().toISOString(),
          recipientRole: "ADMIN",
          recipientName: targetAdmin.name ?? "Admin",
          recipientEmail: targetAdmin.email,
          dashboard_url: process.env.FRONTEND_URL,
        });
      }

      await NotificationOrchestrator.handle(
        NotificationEventType.CONTRACT_WRITTEN_OFF,
        {
          contractId,
          customerName: customer.name ?? "Customer",
          customerEmail: customer.email,
          outstandingAmount: Number(outstandingAmount),
          writeOffReason: validated.reason,
          writtenOffBy: approver.name ?? "Company",
          writtenOffAt: new Date().toISOString(),
          recipientRole: "COMPANY",
          recipientId: approver.userId,
          recipientName: approver.name ?? "Company",
          recipientEmail: approver.email,
          companyId: contract.user.companyId || "",
        },
      );

      emitEvent(DomainEvent.CONTRACT_WRITTEN_OFF, {
        contractId,
        customerName: customer.name ?? "Customer",
        outstandingAmount: Number(outstandingAmount),
        writeOffReason: validated.reason,
        writtenOffBy: approver.name ?? "Company",
        writtenOffAt: new Date().toISOString(),
        recipientRole: "COMPANY",
        recipientName: approver.name ?? "Company",
        recipientEmail: approver.email,
        dashboard_url: process.env.FRONTEND_URL,
      });

      return {
        contractId,
        outstandingAmount: Number(outstandingAmount),
        writeOffReason: validated.reason,
        status: FinancingStatus.WRITTEN_OFF,
      };
    });
  }
}
