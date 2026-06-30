import { NotificationTemplates } from "./notification.template";
import { NotificationRepository } from "./notification.repository";
import {
  NotificationEventType,
  NotificationPayloadMap,
} from "./notification.types";
import { prisma, Role } from "../prisma";

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
        case NotificationEventType.COMMISSION_REQUEST_APPROVAL:
          return await this.handleCommissionRequestApproval(
            payload as NotificationPayloadMap[NotificationEventType.COMMISSION_REQUEST_APPROVAL],
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
        case NotificationEventType.COMMISSION_TRANSFER_INITIATED:
          return await this.handleCommissionTransferInitiated(
            payload as NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_INITIATED],
          );
        case NotificationEventType.COMMISSION_TRANSFER_SUCCESS:
          return await this.handleCommissionTransferSuccess(
            payload as NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_SUCCESS],
          );
        case NotificationEventType.COMMISSION_TRANSFER_FAILED:
          return await this.handleCommissionTransferFailed(
            payload as NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_FAILED],
          );
        case NotificationEventType.COMMISSION_TRANSFER_REVERSED:
          return await this.handleCommissionTransferReversed(
            payload as NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_REVERSED],
          );
        case NotificationEventType.MARKETER_TOGGLE_REQUEST:
          return await this.handleMarketerToggleRequest(
            payload as NotificationPayloadMap[NotificationEventType.MARKETER_TOGGLE_REQUEST],
          );

        case NotificationEventType.MARKETER_DELETE_REQUEST:
          return await this.handleMarketerDeleteRequest(
            payload as NotificationPayloadMap[NotificationEventType.MARKETER_DELETE_REQUEST],
          );

        case NotificationEventType.MARKETER_TOGGLE_APPROVED:
          return await this.handleMarketerToggleApproved(
            payload as NotificationPayloadMap[NotificationEventType.MARKETER_TOGGLE_APPROVED],
          );

        case NotificationEventType.MARKETER_TOGGLE_REJECTED:
          return await this.handleMarketerToggleRejected(
            payload as NotificationPayloadMap[NotificationEventType.MARKETER_TOGGLE_REJECTED],
          );

        case NotificationEventType.MARKETER_DELETE_APPROVED:
          return await this.handleMarketerDeleteApproved(
            payload as NotificationPayloadMap[NotificationEventType.MARKETER_DELETE_APPROVED],
          );

        case NotificationEventType.MARKETER_DELETE_REJECTED:
          return await this.handleMarketerDeleteRejected(
            payload as NotificationPayloadMap[NotificationEventType.MARKETER_DELETE_REJECTED],
          );
        case NotificationEventType.CONTRACT_RESTRUCTURED:
          return await this.handleContractRestructured(
            payload as NotificationPayloadMap[NotificationEventType.CONTRACT_RESTRUCTURED],
          );
        case NotificationEventType.CONTRACT_WRITTEN_OFF:
          return await this.handleContractWrittenOff(
            payload as NotificationPayloadMap[NotificationEventType.CONTRACT_WRITTEN_OFF],
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
      where: { role: { in: ["ADMIN"] } },
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

  private static async handleCommissionRequestApproval(
    payload: NotificationPayloadMap[NotificationEventType.COMMISSION_REQUEST_APPROVAL],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.COMMISSION_REQUEST_APPROVAL,
      payload,
    );

    // 1. ALWAYS notify marketer (single source of truth)
    const marketer = await prisma.user.findUnique({
      where: { userId: payload.marketerId },
      select: { userId: true, companyId: true },
    });

    if (marketer) {
      await NotificationRepository.create({
        userId: marketer.userId,
        type: NotificationEventType.COMMISSION_REQUEST_APPROVAL,
        title: template.title,
        message: template.message,
        metadata: payload,
        idempotencyKey: `commission-status-${payload.requestId}-${payload.role}`,
      });
    }

    // 2. Only notify next approver group (NOT marketers again)
    if (payload.role === "ADMIN") {
      const companyApprovers = await prisma.user.findMany({
        where: {
          companyId: marketer?.companyId,
          role: "COMPANY",
        },
        select: { userId: true },
      });

      await Promise.all(
        companyApprovers.map((approver) =>
          NotificationRepository.create({
            userId: approver.userId,
            type: NotificationEventType.COMMISSION_REQUEST_APPROVAL,
            title: "Action Required: Commission Approval",
            message: `${payload.marketerName}'s payout is awaiting your approval.`,
            metadata: payload,
            idempotencyKey: `commission-await-company-${payload.requestId}-${approver.userId}`,
          }),
        ),
      );
    }
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
  private static async handleCommissionTransferInitiated(
    payload: NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_INITIATED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.COMMISSION_TRANSFER_INITIATED,
      payload,
    );

    await NotificationRepository.create({
      userId: payload.marketerId,
      type: NotificationEventType.COMMISSION_TRANSFER_INITIATED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `commission-transfer-initiated-${payload.payoutId}-${payload.marketerId}`,
    });
  }

  // private static async handleContractRestructured(
  //   payload: NotificationPayloadMap[NotificationEventType.CONTRACT_RESTRUCTURED],
  // ) {
  //   const template = NotificationTemplates.build(
  //     NotificationEventType.CONTRACT_RESTRUCTURED,
  //     payload,
  //   );

  //   await NotificationRepository.create({
  //     userId: payload.marketerId,
  //     type: NotificationEventType.CONTRACT_RESTRUCTURED,
  //     title: template.title,
  //     message: template.message,
  //     metadata: payload,
  //     idempotencyKey: `contract-restructured-${payload.contractId}-${payload.marketerId}`,
  //   });
  // }

  // private static async handleContractWrittenOff(
  //   payload: NotificationPayloadMap[NotificationEventType.CONTRACT_WRITTEN_OFF],
  // ) {
  //   const template = NotificationTemplates.build(
  //     NotificationEventType.CONTRACT_WRITTEN_OFF,
  //     payload,
  //   );

  //   await NotificationRepository.create({
  //     userId: payload.recipientId,
  //     type: NotificationEventType.CONTRACT_WRITTEN_OFF,
  //     title: template.title,
  //     message: template.message,
  //     metadata: payload,
  //     idempotencyKey: `contract-written-off-${payload.contractId}-${payload.recipientRole}-${payload.recipientId}`,
  //   });
  // }

  private static async handleCommissionTransferSuccess(
    payload: NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_SUCCESS],
  ) {
    const marketerTemplate = NotificationTemplates.build(
      NotificationEventType.COMMISSION_TRANSFER_SUCCESS,
      payload,
    );

    await NotificationRepository.create({
      userId: payload.marketerId,
      type: NotificationEventType.COMMISSION_TRANSFER_SUCCESS,
      title: marketerTemplate.title,
      message: marketerTemplate.message,
      metadata: payload,
      idempotencyKey: `transfer-success-marketer-${payload.payoutId}`,
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: payload.companyId, role: "COMPANY" },
      select: { userId: true },
    });

    await Promise.all(
      companyUsers.map((u) =>
        NotificationRepository.create({
          userId: u.userId,
          type: NotificationEventType.COMMISSION_TRANSFER_SUCCESS,
          title: `Transfer Confirmed — ${payload.marketerName}`,
          message: `Payout of ₦${Number(payload.amount).toLocaleString()} to ${payload.marketerName} was successful. Ref: ${payload.transferCode}.`,
          metadata: payload,
          idempotencyKey: `transfer-success-company-${payload.payoutId}-${u.userId}`,
        }),
      ),
    );
  }

  private static async handleCommissionTransferFailed(
    payload: NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_FAILED],
  ) {
    const marketerTemplate = NotificationTemplates.build(
      NotificationEventType.COMMISSION_TRANSFER_FAILED,
      payload,
    );

    const companyTemplate = NotificationTemplates.buildCompanyTransferFailed({
      marketerName: payload.marketerName,
      amount: payload.amount,
      reason: payload.reason,
      payoutId: payload.payoutId,
    });

    await NotificationRepository.create({
      userId: payload.marketerId,
      type: NotificationEventType.COMMISSION_TRANSFER_FAILED,
      title: marketerTemplate.title,
      message: marketerTemplate.message,
      metadata: payload,
      idempotencyKey: `transfer-failed-marketer-${payload.payoutId}`,
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: payload.companyId, role: "COMPANY" },
      select: { userId: true },
    });

    await Promise.all(
      companyUsers.map((u) =>
        NotificationRepository.create({
          userId: u.userId,
          type: NotificationEventType.COMMISSION_TRANSFER_FAILED,
          title: companyTemplate.title,
          message: companyTemplate.message,
          metadata: payload,
          idempotencyKey: `transfer-failed-company-${payload.payoutId}-${u.userId}`,
        }),
      ),
    );
  }

  private static async handleCommissionTransferReversed(
    payload: NotificationPayloadMap[NotificationEventType.COMMISSION_TRANSFER_REVERSED],
  ) {
    const marketerTemplate = NotificationTemplates.build(
      NotificationEventType.COMMISSION_TRANSFER_REVERSED,
      payload,
    );

    const companyTemplate = NotificationTemplates.buildCompanyTransferReversed({
      marketerName: payload.marketerName,
      amount: payload.amount,
      payoutId: payload.payoutId,
    });

    await NotificationRepository.create({
      userId: payload.marketerId,
      type: NotificationEventType.COMMISSION_TRANSFER_REVERSED,
      title: marketerTemplate.title,
      message: marketerTemplate.message,
      metadata: payload,
      idempotencyKey: `transfer-reversed-marketer-${payload.payoutId}`,
    });

    const companyUsers = await prisma.user.findMany({
      where: { companyId: payload.companyId, role: "COMPANY" },
      select: { userId: true },
    });

    await Promise.all(
      companyUsers.map((u) =>
        NotificationRepository.create({
          userId: u.userId,
          type: NotificationEventType.COMMISSION_TRANSFER_REVERSED,
          title: companyTemplate.title,
          message: companyTemplate.message,
          metadata: payload,
          idempotencyKey: `transfer-reversed-company-${payload.payoutId}-${u.userId}`,
        }),
      ),
    );
  }

  private static async handleMarketerToggleRequest(
    payload: NotificationPayloadMap[NotificationEventType.MARKETER_TOGGLE_REQUEST],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.MARKETER_TOGGLE_REQUEST,
      payload,
    );

    const companyUsers = await prisma.user.findMany({
      where: {
        companyId: payload.companyId,
        role: Role.COMPANY,
      },

      select: {
        userId: true,
      },
    });

    await Promise.all(
      companyUsers.map((companyUser) =>
        NotificationRepository.create({
          userId: companyUser.userId,
          type: NotificationEventType.MARKETER_TOGGLE_REQUEST,
          title: template.title,
          message: template.message,
          metadata: payload,
          idempotencyKey: `marketer-toggle-request-${payload.requestId}-${companyUser.userId}`,
        }),
      ),
    );
  }

  private static async handleMarketerDeleteRequest(
    payload: NotificationPayloadMap[NotificationEventType.MARKETER_DELETE_REQUEST],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.MARKETER_DELETE_REQUEST,
      payload,
    );

    const companyUsers = await prisma.user.findMany({
      where: {
        companyId: payload.companyId,
        role: Role.COMPANY,
      },

      select: {
        userId: true,
      },
    });

    await Promise.all(
      companyUsers.map((companyUser) =>
        NotificationRepository.create({
          userId: companyUser.userId,
          type: NotificationEventType.MARKETER_DELETE_REQUEST,
          title: template.title,
          message: template.message,
          metadata: payload,
          idempotencyKey: `marketer-delete-request-${payload.requestId}-${companyUser.userId}`,
        }),
      ),
    );
  }

  private static async handleMarketerToggleApproved(
    payload: NotificationPayloadMap[NotificationEventType.MARKETER_TOGGLE_APPROVED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.MARKETER_TOGGLE_APPROVED,
      payload,
    );

    const request = await prisma.approvalRequest.findUnique({
      where: {
        requestId: payload.requestId,
      },

      select: {
        requestedById: true,
      },
    });

    if (!request) return;

    await NotificationRepository.create({
      userId: request.requestedById,
      type: NotificationEventType.MARKETER_TOGGLE_APPROVED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `marketer-toggle-approved-${payload.requestId}`,
    });
  }

  private static async handleMarketerToggleRejected(
    payload: NotificationPayloadMap[NotificationEventType.MARKETER_TOGGLE_REJECTED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.MARKETER_TOGGLE_REJECTED,
      payload,
    );

    const request = await prisma.approvalRequest.findUnique({
      where: {
        requestId: payload.requestId,
      },

      select: {
        requestedById: true,
      },
    });

    if (!request) return;

    await NotificationRepository.create({
      userId: request.requestedById,
      type: NotificationEventType.MARKETER_TOGGLE_REJECTED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `marketer-toggle-rejected-${payload.requestId}`,
    });
  }

  private static async handleMarketerDeleteApproved(
    payload: NotificationPayloadMap[NotificationEventType.MARKETER_DELETE_APPROVED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.MARKETER_DELETE_APPROVED,
      payload,
    );

    const request = await prisma.approvalRequest.findUnique({
      where: {
        requestId: payload.requestId,
      },

      select: {
        requestedById: true,
      },
    });

    if (!request) return;

    await NotificationRepository.create({
      userId: request.requestedById,
      type: NotificationEventType.MARKETER_DELETE_APPROVED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `marketer-delete-approved-${payload.requestId}`,
    });
  }

  private static async handleMarketerDeleteRejected(
    payload: NotificationPayloadMap[NotificationEventType.MARKETER_DELETE_REJECTED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.MARKETER_DELETE_REJECTED,
      payload,
    );

    const request = await prisma.approvalRequest.findUnique({
      where: {
        requestId: payload.requestId,
      },

      select: {
        requestedById: true,
      },
    });

    if (!request) return;

    await NotificationRepository.create({
      userId: request.requestedById,
      type: NotificationEventType.MARKETER_DELETE_REJECTED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `marketer-delete-rejected-${payload.requestId}`,
    });
  }

  private static async handleContractRestructured(
    payload: NotificationPayloadMap[NotificationEventType.CONTRACT_RESTRUCTURED],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.CONTRACT_RESTRUCTURED,
      payload,
    );

    await NotificationRepository.create({
      userId: payload.marketerId,
      type: NotificationEventType.CONTRACT_RESTRUCTURED,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `contract-restructured-${payload.contractId}-${payload.marketerId}`,
    });
  }

  private static async handleContractWrittenOff(
    payload: NotificationPayloadMap[NotificationEventType.CONTRACT_WRITTEN_OFF],
  ) {
    const template = NotificationTemplates.build(
      NotificationEventType.CONTRACT_WRITTEN_OFF,
      payload,
    );

    await NotificationRepository.create({
      userId: payload.recipientId,
      type: NotificationEventType.CONTRACT_WRITTEN_OFF,
      title: template.title,
      message: template.message,
      metadata: payload,
      idempotencyKey: `contract-written-off-${payload.contractId}-${payload.recipientRole}-${payload.recipientId}`,
    });
  }
}
