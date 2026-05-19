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
}
