import { NotificationEventType } from "./notification.types";

export class NotificationTemplates {
  static build(type: NotificationEventType, payload: any) {
    switch (type) {
      case NotificationEventType.KYC_APPLICATION_SUBMITTED:
        return {
          title: "New Installment Application",
          message: `Customer "${payload.customerName}" submitted an application for review.`,
        };

      case NotificationEventType.INSTALLMENT_OVERDUE:
        return {
          title: "Installment Overdue",
          message: `Installment payment for ${payload.customerName} is overdue.`,
        };

      case NotificationEventType.PAYMENT_CONFIRMED:
        return {
          title: "Payment Confirmed",
          message: `Payment of ₦${payload.amount} has been confirmed.`,
        };

      case NotificationEventType.COMMISSION_ACCRUED:
        return {
          title: "Commission Earned",
          message: `You earned ₦${payload.amount} commission.`,
        };

      case NotificationEventType.COMMISSION_TRANSFER_REQUEST:
        return {
          title: "Commission Withdrawal Request",
          message: `${payload.marketerName} requested commission payout.`,
        };

      default:
        return {
          title: "Notification",
          message: "You have a new notification.",
        };
    }
  }
}
