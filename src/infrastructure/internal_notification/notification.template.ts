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

      case NotificationEventType.COMMISSION_REQUEST_APPROVAL: {
        const base = `Hello ${payload.marketerName}, your payout request (${payload.requestId}) for ₦${payload.amount.toLocaleString()}`;

        if (payload.role === "ADMIN") {
          return {
            title: "Payout Approved by Admin",
            message: `${base} has been approved by an administrator and is now awaiting company approval.`,
          };
        }

        return {
          title: "Payout Approved by Company",
          message: `${base} has been approved by the company and is now awaiting transfer processing.`,
        };
      }
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

      case NotificationEventType.MARKETER_TOGGLE_REQUEST:
        return {
          title: "Marketer Status Change Request",
          message: `${payload.requestedBy} requested to change the active status of marketer "${payload.marketerName}". Approval is required.`,
        };

      case NotificationEventType.MARKETER_DELETE_REQUEST:
        return {
          title: "Marketer Deletion Request",
          message: `${payload.requestedBy} requested to delete marketer "${payload.marketerName}". Approval is required.`,
        };

      case NotificationEventType.MARKETER_TOGGLE_APPROVED:
        return {
          title: "Marketer Status Updated",
          message: `Your request to change the status of marketer "${payload.marketerName}" has been approved and executed.`,
        };

      case NotificationEventType.MARKETER_TOGGLE_REJECTED:
        return {
          title: "Marketer Status Request Rejected",
          message: `Your request to change the status of marketer "${payload.marketerName}" was rejected.`,
        };

      case NotificationEventType.MARKETER_DELETE_APPROVED:
        return {
          title: "Marketer Deleted",
          message: `Your request to delete marketer "${payload.marketerName}" has been approved and completed.`,
        };

      case NotificationEventType.MARKETER_DELETE_REJECTED:
        return {
          title: "Marketer Deletion Request Rejected",
          message: `Your request to delete marketer "${payload.marketerName}" was rejected.`,
        };

      default:
        return {
          title: "Notification",
          message: "You have a new notification.",
        };
    }
  }
  static buildCompanyTransferFailed(payload: {
    marketerName: string;
    amount: number;
    reason: string;
    payoutId: string;
  }) {
    return {
      title: "Commission Transfer Failed",
      message: `The payout of ₦${Number(payload.amount).toLocaleString()} to ${payload.marketerName} failed. Reason: ${payload.reason}. Payout ID: ${payload.payoutId}. The commission liability has been restored and the payout can be retried.`,
    };
  }

  static buildCompanyTransferReversed(payload: {
    marketerName: string;
    amount: number;
    payoutId: string;
  }) {
    return {
      title: "Commission Transfer Reversed",
      message: `The payout of ₦${Number(payload.amount).toLocaleString()} to ${payload.marketerName} was reversed by Paystack. Payout ID: ${payload.payoutId}. Commission liability has been restored.`,
    };
  }
}
