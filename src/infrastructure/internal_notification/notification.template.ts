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
          message: `${payload.marketerName} requested a commission payout of ${payload.amount}.`,
        };

      case NotificationEventType.INSTALLMENT_REMINDER_3DAY:
        return {
          title: "Payment Due in 3 Days",
          message: `Your installment #${payload.sequence} for ${payload.productName} (${payload.amount}) is due on ${payload.dueDate}. Please ensure your payment is ready.`,
        };

      case NotificationEventType.INSTALLMENT_DUE_TODAY:
        return {
          title: "Your Payment is Due Today",
          message: `Installment #${payload.sequence} for ${payload.productName} (${payload.amount}) is due today. Tap to pay now.`,
        };

      case NotificationEventType.INSTALLMENT_OVERDUE_3DAY:
        return {
          title: "⚠️ Payment Overdue",
          message: `Your installment #${payload.sequence} for ${payload.productName} (${payload.amount}) was due on ${payload.dueDate} and remains unpaid. Please make payment immediately to avoid further escalation.`,
        };

      case NotificationEventType.INSTALLMENT_OVERDUE_7DAY:
        return {
          title: "🚨 URGENT: Overdue Payment",
          message: `This is a final notice. Your installment #${payload.sequence} for ${payload.productName} (${payload.amount}) is now 7 days overdue. This matter has been escalated to management. Pay immediately to avoid default status.`,
        };

      default:
        return {
          title: "Notification",
          message: "You have a new notification.",
        };
    }
  }
}
