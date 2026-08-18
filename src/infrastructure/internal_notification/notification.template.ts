import {
  NotificationEventType,
  type NotificationPayloadMap,
} from "./notification.types";

type NotificationBuildArgs = {
  [K in NotificationEventType]: [type: K, payload: NotificationPayloadMap[K]];
}[NotificationEventType];

export class NotificationTemplates {
  static build(...args: NotificationBuildArgs) {
    const [type, p] = args;
    switch (type) {
      case NotificationEventType.KYC_APPLICATION_SUBMITTED:
        return {
          title: "New Installment Application",
          message: `Customer "${p.customerName}" submitted an application for review.`,
        };

      case NotificationEventType.INSTALLMENT_OVERDUE:
        return {
          title: "Installment Overdue",
          message: `Installment payment for ${p.customerName} is overdue.`,
        };

      case NotificationEventType.PAYMENT_CONFIRMED:
        return {
          title: "Payment Confirmed",
          message: `Payment of ₦${p.amount} has been confirmed.`,
        };

      case NotificationEventType.COMMISSION_ACCRUED:
        return {
          title: "Commission Earned",
          message: `You earned ₦${p.amount} commission.`,
        };

      case NotificationEventType.COMMISSION_TRANSFER_REQUEST:
        return {
          title: "Commission Withdrawal Request",
          message: `${p.marketerName} requested a commission payout of ${p.amount}.`,
        };

      case NotificationEventType.COMMISSION_REQUEST_APPROVAL: {
        const base = `Hello ${p.marketerName}, your payout request (${p.requestId}) for ₦${p.amount.toLocaleString()}`;

        if (p.role === "ADMIN") {
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
          message: `Your installment #${p.sequence} for ${p.productName} (${p.amount}) is due on ${p.dueDate}. Please ensure your payment is ready.`,
        };

      case NotificationEventType.INSTALLMENT_REMINDER_1DAY:
        return {
          title: "Final Payment Reminder — Due Tomorrow",
          message: `Your installment #${p.sequence} for ${p.productName} (${p.amount}) is due tomorrow (${p.dueDate}). Please make your payment today to avoid any disruption.`,
        };

      case NotificationEventType.INSTALLMENT_DUE_TODAY:
        return {
          title: "Your Payment is Due Today",
          message: `Installment #${p.sequence} for ${p.productName} (${p.amount}) is due today. Tap to pay now.`,
        };

      case NotificationEventType.INSTALLMENT_OVERDUE_RECURRING:
        return {
          title: "Payment Overdue — Daily Reminder",
          message: `Your installment #${p.sequence} for ${p.productName} (${p.amount}) is ${p.daysOverdue} day(s) overdue (due on ${p.dueDate}). Please make payment immediately to avoid further escalation.`,
        };

      case NotificationEventType.INSTALLMENT_OVERDUE_3DAY:
        return {
          title: "⚠️ Payment Overdue",
          message: `Your installment #${p.sequence} for ${p.productName} (${p.amount}) was due on ${p.dueDate} and remains unpaid. Please make payment immediately to avoid further escalation.`,
        };

      case NotificationEventType.INSTALLMENT_OVERDUE_7DAY:
        return {
          title: "🚨 URGENT: Overdue Payment",
          message: `This is a final notice. Your installment #${p.sequence} for ${p.productName} (${p.amount}) is now 7 days overdue. This matter has been escalated to management. Pay immediately to avoid default status.`,
        };

      case NotificationEventType.MARKETER_TOGGLE_REQUEST:
        return {
          title: "Marketer Status Change Request",
          message: `${p.requestedBy} requested to change the active status of marketer "${p.marketerName}". Approval is required.`,
        };

      case NotificationEventType.MARKETER_DELETE_REQUEST:
        return {
          title: "Marketer Deletion Request",
          message: `${p.requestedBy} requested to delete marketer "${p.marketerName}". Approval is required.`,
        };

      case NotificationEventType.MARKETER_TOGGLE_APPROVED:
        return {
          title: "Marketer Status Updated",
          message: `Your request to change the status of marketer "${p.marketerName}" has been approved and executed.`,
        };

      case NotificationEventType.MARKETER_TOGGLE_REJECTED:
        return {
          title: "Marketer Status Request Rejected",
          message: `Your request to change the status of marketer "${p.marketerName}" was rejected.`,
        };

      case NotificationEventType.MARKETER_DELETE_APPROVED:
        return {
          title: "Marketer Deleted",
          message: `Your request to delete marketer "${p.marketerName}" has been approved and completed.`,
        };

      case NotificationEventType.MARKETER_DELETE_REJECTED:
        return {
          title: "Marketer Deletion Request Rejected",
          message: `Your request to delete marketer "${p.marketerName}" was rejected.`,
        };

      case NotificationEventType.CONTRACT_RESTRUCTURED:
        return {
          title: "Contract Restructured",
          message: `Contract for customer "${p.customerName}" has been restructured. New total financed: ₦${Number(p.newTotalFinanced).toLocaleString()}. Restructured by: ${p.restructuredBy}.`,
        };

      case NotificationEventType.CONTRACT_WRITTEN_OFF:
        if (p.recipientRole === "MARKETER") {
          return {
            title: "Contract Written Off",
            message: `The financing contract for your customer "${p.customerName}" has been written off. Outstanding amount: ₦${Number(p.outstandingAmount).toLocaleString()}. Reason: ${p.writeOffReason}. Written off by: ${p.writtenOffBy}.`,
          };
        }
        if (p.recipientRole === "ADMIN") {
          return {
            title: "Contract Written Off",
            message: `Contract for customer "${p.customerName}" (referred by marketer under your supervision) has been written off. Outstanding amount: ₦${Number(p.outstandingAmount).toLocaleString()}. Reason: ${p.writeOffReason}. Written off by: ${p.writtenOffBy}.`,
          };
        }
        return {
          title: "Contract Written Off",
          message: `Contract for customer "${p.customerName}" has been written off. Outstanding amount: ₦${Number(p.outstandingAmount).toLocaleString()}. Reason: ${p.writeOffReason}.`,
        };

      case NotificationEventType.ONBOARDING_SESSION_EXPIRED:
        return {
          title: "Onboarding Session Expired",
          message: `The onboarding session for customer "${p.customerName}" (${p.customerEmail}) has expired${p.hadKycApplication ? " and their KYC application was auto-rejected" : ""}. Referred by: ${p.marketerName || "direct"}.`,
        };

      case NotificationEventType.KYC_APPLICATION_AUTO_EXPIRED:
        return {
          title: "KYC Application Auto-Expired",
          message: `KYC application for ${p.customerName} (${p.customerEmail}) was auto-rejected after remaining pending for 15+ days${p.hadOnboardingSession ? " following an expired onboarding session" : ""}. Referred by: ${p.marketerName || "direct"}.`,
        };

      default:
        return {
          title: "Notification",
          message: "You have a new notification.",
        };
    }
  }
  static buildCompanyTransferFailed(p: {
    marketerName: string;
    amount: number;
    reason: string;
    payoutId: string;
  }) {
    return {
      title: "Commission Transfer Failed",
      message: `The payout of ₦${Number(p.amount).toLocaleString()} to ${p.marketerName} failed. Reason: ${p.reason}. Payout ID: ${p.payoutId}. The commission liability has been restored and the payout can be retried.`,
    };
  }

  static buildCompanyTransferReversed(p: {
    marketerName: string;
    amount: number;
    payoutId: string;
  }) {
    return {
      title: "Commission Transfer Reversed",
      message: `The payout of ₦${Number(p.amount).toLocaleString()} to ${p.marketerName} was reversed by Paystack. Payout ID: ${p.payoutId}. Commission liability has been restored.`,
    };
  }
}
