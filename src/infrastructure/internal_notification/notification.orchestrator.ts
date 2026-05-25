import { NotificationTemplates } from "./notification.template";
import { NotificationRepository } from "./notification.repository";
import {
  NotificationEventType,
  NotificationPayloadMap,
} from "./notification.types";
import { prisma } from "../prisma";

export class NotificationOrchestrator {
  /**
   * Single entry point. Call this from any service.
   * Fire-and-forget safe — wrap in void or await depending on criticality.
   *
   * @example
   * await NotificationOrchestrator.handle(
   *   NotificationEventType.KYC_APPLICATION_SUBMITTED,
   *   { applicationId, customerName, customerEmail, customer }
   * );
   */
  static async handle<T extends NotificationEventType>(
    type: T,
    payload: NotificationPayloadMap[T],
  ): Promise<void> {
    try {
      switch (type) {
        case NotificationEventType.KYC_APPLICATION_SUBMITTED:
          return await this.handleKycSubmitted(
            payload as NotificationPayloadMap[NotificationEventType.KYC_APPLICATION_SUBMITTED],
          );
        case NotificationEventType.INSTALLMENT_OVERDUE:
          return await this.handleInstallmentOverdue(
            payload as NotificationPayloadMap[NotificationEventType.INSTALLMENT_OVERDUE],
          );
        case NotificationEventType.PAYMENT_CONFIRMED:
          return await this.handlePaymentConfirmed(
            payload as NotificationPayloadMap[NotificationEventType.PAYMENT_CONFIRMED],
          );
        case NotificationEventType.COMMISSION_ACCRUED:
          return await this.handleCommissionAccrued(
            payload as NotificationPayloadMap[NotificationEventType.COMMISSION_ACCRUED],
          );
        case NotificationEventType.COMMISSION_TRANSFER_REQUEST:
          return await this.handleCommissionTransferRequest(
            payload as NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_REQUEST],
          );
        case NotificationEventType.INSTALLMENT_REMINDER_3DAY:
          return await this.handleInstallmentReminder3Day(
            payload as NotificationPayloadMap[NotificationEventType.INSTALLMENT_REMINDER_3DAY],
          );
        case NotificationEventType.INSTALLMENT_DUE_TODAY:
          return await this.handleInstallmentDueToday(
            payload as NotificationPayloadMap[NotificationEventType.INSTALLMENT_DUE_TODAY],
          );
        case NotificationEventType.INSTALLMENT_OVERDUE_3DAY:
          return await this.handleInstallmentOverdue3Day(
            payload as NotificationPayloadMap[NotificationEventType.INSTALLMENT_OVERDUE_3DAY],
          );
        case NotificationEventType.INSTALLMENT_OVERDUE_7DAY:
          return await this.handleInstallmentOverdue7Day(
            payload as NotificationPayloadMap[NotificationEventType.INSTALLMENT_OVERDUE_7DAY],
          );
      }
    } catch (err: any) {
      // Notifications are non-critical — log and continue
      console.error(
        `[NotificationOrchestrator] Failed to handle ${type}:`,
        err.message,
      );
    }
  }

  private static async handleKycSubmitted(
    payload: NotificationPayloadMap[NotificationEventType.KYC_APPLICATION_SUBMITTED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.KYC_APPLICATION_SUBMITTED,
      payload,
    );

    const recipients = await this.resolveKycRecipients(payload.customer);

    await Promise.all(
      recipients.map(
        ({ userId, idempotencySuffix, titleSuffix, messageSuffix }) =>
          NotificationRepository.create({
            userId,
            type: NotificationEventType.KYC_APPLICATION_SUBMITTED,
            title: titleSuffix
              ? `${template.title} ${titleSuffix}`
              : template.title,
            message: messageSuffix
              ? `${template.message} ${messageSuffix}`
              : template.message,
            metadata: payload,
            idempotencyKey: `kyc-submitted-${payload.applicationId}-${idempotencySuffix}`,
          }),
      ),
    );
  }

  private static async handleInstallmentOverdue(
    payload: NotificationPayloadMap[NotificationEventType.INSTALLMENT_OVERDUE],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.INSTALLMENT_OVERDUE,
      payload,
    );

    await NotificationRepository.create({
      userId: payload.userId,
      type: NotificationEventType.INSTALLMENT_OVERDUE,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `installment-overdue-${payload.installmentId}`,
    });
  }

  private static async handlePaymentConfirmed(
    payload: NotificationPayloadMap[NotificationEventType.PAYMENT_CONFIRMED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.PAYMENT_CONFIRMED,
      payload,
    );

    await NotificationRepository.create({
      userId: payload.userId,
      type: NotificationEventType.PAYMENT_CONFIRMED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `payment-confirmed-${payload.paymentId}`,
    });
  }

  private static async handleCommissionAccrued(
    payload: NotificationPayloadMap[NotificationEventType.COMMISSION_ACCRUED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.COMMISSION_ACCRUED,
      payload,
    );

    await NotificationRepository.create({
      userId: payload.marketerId,
      type: NotificationEventType.COMMISSION_ACCRUED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `commission-accrued-${payload.commissionId}`,
    });
  }

  private static async handleCommissionTransferRequest(
    payload: NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_REQUEST],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.COMMISSION_TRANSFER_REQUEST,
      payload,
    );

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { userId: true },
    });

    await Promise.all(
      admins.map((admin) =>
        NotificationRepository.create({
          userId: admin.userId,
          type: NotificationEventType.COMMISSION_TRANSFER_REQUEST,
          title: template.title,
          message: template.message,
          metadata: payload,
          idempotencyKey: `commission-transfer-${payload.requestId}-${admin.userId}`,
        }),
      ),
    );
  }

  private static async resolveKycRecipients(customer: {
    userId: string;
    referredByMarketerId?: string;
  }): Promise<
    Array<{
      userId: string;
      idempotencySuffix: string;
      titleSuffix?: string;
      messageSuffix?: string;
    }>
  > {
    if (!customer.referredByMarketerId) {
      const superAdmin = await prisma.user.findFirst({
        where: { role: "SUPER_ADMIN" },
        select: { userId: true },
      });

      if (!superAdmin) return [];

      return [
        {
          userId: superAdmin.userId,
          idempotencySuffix: `superadmin-${superAdmin.userId}`,
          titleSuffix: "(Direct Applicant)",
        },
      ];
    }

    const marketerId = customer.referredByMarketerId;
    const recipients: Awaited<ReturnType<typeof this.resolveKycRecipients>> = [
      {
        userId: marketerId,
        idempotencySuffix: `marketer-${marketerId}`,
      },
    ];

    const marketer = await prisma.user.findUnique({
      where: { userId: marketerId },
      select: { createdById: true },
    });

    if (marketer?.createdById) {
      recipients.push({
        userId: marketer.createdById,
        idempotencySuffix: `admin-${marketer.createdById}`,
        titleSuffix: "(Marketer Referral)",
        messageSuffix: `(Assigned Marketer: ${marketerId})`,
      });
    }

    return recipients;
  }

  private static async handleInstallmentReminder3Day(
    payload: NotificationPayloadMap[NotificationEventType.INSTALLMENT_REMINDER_3DAY],
  ) {
    await NotificationRepository.create({
      userId: payload.customerId,
      type: NotificationEventType.INSTALLMENT_REMINDER_3DAY,
      title: "Payment Due in 3 Days",
      message: `Your installment #${payload.sequence} for ${payload.productName} (${payload.amount}) is due on ${payload.dueDate}. Please ensure your payment is ready.`,
      metadata: {
        installmentId: payload.installmentId,
        sequence: payload.sequence,
        dueDate: payload.dueDate,
        amount: payload.amount,
      },
      idempotencyKey: `reminder-3day-${payload.installmentId}`,
    });
  }

  private static async handleInstallmentDueToday(
    payload: NotificationPayloadMap[NotificationEventType.INSTALLMENT_DUE_TODAY],
  ) {
    await NotificationRepository.create({
      userId: payload.customerId,
      type: NotificationEventType.INSTALLMENT_DUE_TODAY,
      title: "Your Payment is Due Today",
      message: `Installment #${payload.sequence} for ${payload.productName} (${payload.amount}) is due today. Tap to pay now.`,
      metadata: {
        installmentId: payload.installmentId,
        sequence: payload.sequence,
        amount: payload.amount,
        payment_url: payload.payment_url,
      },
      idempotencyKey: `due-today-${payload.installmentId}`,
    });
  }

  private static async handleInstallmentOverdue3Day(
    payload: NotificationPayloadMap[NotificationEventType.INSTALLMENT_OVERDUE_3DAY],
  ) {
    await Promise.all([
      NotificationRepository.create({
        userId: payload.customerId,
        type: NotificationEventType.INSTALLMENT_OVERDUE_3DAY,
        title: "⚠️ Payment Overdue",
        message: `Your installment #${payload.sequence} for ${payload.productName} (${payload.amount}) was due on ${payload.dueDate} and remains unpaid. Please make payment immediately to avoid further escalation.`,
        metadata: {
          installmentId: payload.installmentId,
          sequence: payload.sequence,
          amount: payload.amount,
          daysOverdue: 3,
        },
        idempotencyKey: `overdue-3day-customer-${payload.installmentId}`,
      }),

      payload.marketerId
        ? NotificationRepository.create({
            userId: payload.marketerId,
            type: NotificationEventType.INSTALLMENT_OVERDUE_3DAY,
            title: "Customer Payment Overdue",
            message: `${payload.customerName} has not paid installment #${payload.sequence} for ${payload.productName}${payload.variantName ? ` (${payload.variantName})` : ""}. Amount: ${payload.amount}. Due date: ${payload.dueDate}. Progress so far: ${payload.percentagePaid}% paid.`,
            metadata: {
              installmentId: payload.installmentId,
              customerId: payload.customerId,
              customerName: payload.customerName,
              sequence: payload.sequence,
              percentagePaid: payload.percentagePaid,
              daysOverdue: 3,
            },
            idempotencyKey: `overdue-3day-marketer-${payload.installmentId}`,
          })
        : Promise.resolve(),
    ]);
  }

  private static async handleInstallmentOverdue7Day(
    payload: NotificationPayloadMap[NotificationEventType.INSTALLMENT_OVERDUE_7DAY],
  ) {
    const notifications = [
      NotificationRepository.create({
        userId: payload.customerId,
        type: NotificationEventType.INSTALLMENT_OVERDUE_7DAY,
        title: "🚨 URGENT: Overdue Payment",
        message: `This is a final notice. Your installment #${payload.sequence} for ${payload.productName} (${payload.amount}) is now 7 days overdue. This matter has been escalated to management. Pay immediately to avoid default status.`,
        metadata: {
          installmentId: payload.installmentId,
          sequence: payload.sequence,
          amount: payload.amount,
          daysOverdue: 7,
          escalated: true,
        },
        idempotencyKey: `overdue-7day-customer-${payload.installmentId}`,
      }),

      NotificationRepository.create({
        userId: payload.adminId,
        type: NotificationEventType.INSTALLMENT_OVERDUE_7DAY,
        title: "Escalation: 7-Day Overdue Installment",
        message: `Customer ${payload.customerName} (referred by marketer ${payload.marketerName}) has missed installment #${payload.sequence} for ${payload.productName}${payload.variantName ? ` — ${payload.variantName}` : ""}. Expected payment date: ${payload.expectedPaymentDate}. Amount: ${payload.amount}. Total progress: ${payload.percentagePaid}% paid. Immediate review recommended.`,
        metadata: {
          installmentId: payload.installmentId,
          customerId: payload.customerId,
          marketerId: payload.marketerId,
          marketerName: payload.marketerName,
          sequence: payload.sequence,
          percentagePaid: payload.percentagePaid,
          daysOverdue: 7,
        },
        idempotencyKey: `overdue-7day-admin-${payload.installmentId}`,
      }),
    ];

    if (payload.marketerId) {
      notifications.push(
        NotificationRepository.create({
          userId: payload.marketerId,
          type: NotificationEventType.INSTALLMENT_OVERDUE_7DAY,
          title: "Escalation Notice",
          message: `The overdue payment for ${payload.customerName} (installment #${payload.sequence} — ${payload.productName}, ${payload.amount}) has now been escalated to your assigned admin. Management has been notified. Please follow up with the customer directly.`,
          metadata: {
            installmentId: payload.installmentId,
            customerId: payload.customerId,
            adminId: payload.adminId,
            daysOverdue: 7,
            escalated: true,
          },
          idempotencyKey: `overdue-7day-marketer-${payload.installmentId}`,
        }),
      );
    }

    await Promise.all(notifications);
  }
}
