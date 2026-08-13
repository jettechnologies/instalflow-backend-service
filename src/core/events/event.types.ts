// src/events/event.types.ts

export enum DomainEvent {
  USER_REGISTERED = "user.registered",
  STAFF_CREATED = "staff.created",
  OTP_REQUESTED = "auth.otp.requested",
  PASSWORD_RESET_REQUESTED = "auth.password.reset.requested",
  PASSWORD_RESET_COMPLETED = "auth.password.reset.completed",
  PASSWORD_CHANGED = "auth.password.changed",
  ORDER_CREATED = "order.created",
  ORDER_CANCELLED = "order.cancelled",
  ORDER_STATUS_UPDATED = "order.status.updated",
  COMPANY_ONBOARDED = "company.onboarded",
  INSTALLMENT_PAID = "installment.paid",
  INSTALLMENT_REMINDER_3DAY = "installment.reminder.3day",
  INSTALLMENT_REMINDER_1DAY = "installment.reminder.1day",
  INSTALLMENT_DUE_TODAY = "installment.due.today",
  INSTALLMENT_OVERDUE_RECURRING = "installment.overdue.recurring",
  INSTALLMENT_OVERDUE_3DAY = "installment.overdue.3day",
  INSTALLMENT_OVERDUE_7DAY = "installment.overdue.7day",
  COMMISSION_TRANSFER_INITIATED = "commission.transfer.initiated",
  COMMISSION_TRANSFER_SUCCESS = "commission.transfer.success",
  COMMISSION_TRANSFER_FAILED = "commission.transfer.failed",
  COMMISSION_TRANSFER_REVERSED = "commission.transfer.reversed",
  MARKETER_ACCOUNT_DELETED = "marketer.account.deleted",
  MARKETER_TOGGLE_STATUS = "marketer.toggle.status",
  ADMIN_TOGGLE_STATUS = "admin.toggle.status",
  ADMIN_ACCOUNT_DELETED = "admin.account.deleted",
  ONBOARDING_SESSION_EXPIRED = "onboarding.session.expired",
  KYC_APPLICATION_AUTO_EXPIRED = "kyc.application.auto-expired",

  // Merchant settlement — fully automatic, no manual approval. Informational
  // only for COMPANY (nothing actionable), audit-relevant for SUPER_ADMIN.
  MERCHANT_SETTLEMENT_GENERATED = "merchant_settlement.generated",
  MERCHANT_SETTLEMENT_TRANSFER_INITIATED = "merchant_settlement.transfer.initiated",
  MERCHANT_SETTLEMENT_TRANSFER_SUCCESS = "merchant_settlement.transfer.success",
  MERCHANT_SETTLEMENT_TRANSFER_FAILED = "merchant_settlement.transfer.failed",
  MERCHANT_SETTLEMENT_TRANSFER_REVERSED = "merchant_settlement.transfer.reversed",

  // Company SaaS subscription renewal — distinct from installment reminders above.
  SUBSCRIPTION_RENEWAL_REMINDER_7DAY = "subscription.renewal.reminder.7day",
  SUBSCRIPTION_RENEWAL_REMINDER_3DAY = "subscription.renewal.reminder.3day",
  SUBSCRIPTION_EXPIRES_TODAY = "subscription.expires.today",
  SUBSCRIPTION_GRACE_PERIOD_STARTED = "subscription.grace_period.started",
  SUBSCRIPTION_GRACE_PERIOD_EXPIRING = "subscription.grace_period.expiring",
  SUBSCRIPTION_RESTRICTED = "subscription.restricted",
}

export enum EventStatus {
  PENDING = "pending",
  PROCESSED = "processed",
  FAILED = "failed",
}

export interface InstallmentReminderBase {
  customerEmail: string;
  customerName: string;
  customerId: string;
  installmentId: string;
  sequence: number;
  dueDate: string;
  amount: string;
  productName: string;
  variantName?: string;
  percentagePaid: number;
  payment_url?: string;
  dashboard_url?: string;
}

export interface CommissionTransferInitiatedPayload {
  marketerEmail: string;
  marketerName: string;
  marketerId: string;
  amount: number; // naira
  payoutId: string;
  bankName: string;
  maskedAccount: string; // "****1234"
  dashboard_url?: string;
}

export interface CommissionTransferSuccessPayload {
  marketerEmail: string;
  marketerName: string;
  marketerId: string;
  amount: number;
  payoutId: string;
  transferCode: string;
  bankName: string;
  maskedAccount: string;
  companyId: string;
  companyEmails: string[];
  dashboard_url?: string;
}

export interface CommissionTransferFailedPayload {
  marketerEmail: string;
  marketerName: string;
  marketerId: string;
  amount: number;
  payoutId: string;
  reason: string;
  companyId: string;
  companyEmails: string[];
  dashboard_url?: string;
}

export interface CommissionTransferReversedPayload {
  marketerEmail: string;
  marketerName: string;
  marketerId: string;
  amount: number;
  payoutId: string;
  companyId: string;
  companyEmails: string[];
  dashboard_url?: string;
}

export interface MerchantSettlementGeneratedPayload {
  companyId: string;
  companyEmails: string[];
  settlementId: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  dashboard_url?: string;
}

export interface MerchantSettlementTransferInitiatedPayload {
  companyId: string;
  companyEmails: string[];
  settlementId: string;
  amount: number;
  bankName: string;
  maskedAccount: string;
  dashboard_url?: string;
}

export interface MerchantSettlementTransferSuccessPayload {
  companyId: string;
  companyEmails: string[];
  settlementId: string;
  amount: number;
  transferCode: string;
  bankName: string;
  maskedAccount: string;
  dashboard_url?: string;
}

export interface MerchantSettlementTransferFailedPayload {
  companyId: string;
  companyEmails: string[];
  settlementId: string;
  amount: number;
  reason: string;
  dashboard_url?: string;
}

export interface MerchantSettlementTransferReversedPayload {
  companyId: string;
  companyEmails: string[];
  settlementId: string;
  amount: number;
  dashboard_url?: string;
}

export interface SubscriptionRenewalBase {
  companyId: string;
  companyEmails: string[];
  companyName: string;
  planName: string;
  endDate: string;
  payment_url?: string;
  dashboard_url?: string;
}

export interface SubscriptionGracePeriodPayload extends SubscriptionRenewalBase {
  gracePeriodDays: number;
}

export interface Reminder3DayPayload extends InstallmentReminderBase {}

export interface Reminder1DayPayload extends InstallmentReminderBase {}

export interface DueTodayPayload extends InstallmentReminderBase {}

export interface OverdueRecurringPayload extends InstallmentReminderBase {
  daysOverdue: number;
}

export interface Overdue3DayPayload extends InstallmentReminderBase {
  marketerEmail: string;
  marketerName: string;
  marketerId: string;
}

export interface Overdue7DayPayload extends InstallmentReminderBase {
  marketerEmail: string;
  marketerName: string;
  marketerId: string;

  adminEmail: string;
  adminName: string;
  adminId: string;

  expectedPaymentDate: string;
}

export interface DomainEventPayloads {
  [DomainEvent.USER_REGISTERED]: {
    email: string;
    name: string;
    dashboard_url?: string;
    role?: string;
    applicationUnderReview?: boolean;
    activationToken?: string;
    rejectionReason?: string;
  };
  [DomainEvent.STAFF_CREATED]: {
    email: string;
    name: string;
    role: string;
    tempPassword: string;
    dashboard_url?: string;
  };
  [DomainEvent.OTP_REQUESTED]: {
    email: string;
    otp: string;
  };
  [DomainEvent.PASSWORD_RESET_REQUESTED]: {
    email: string;
    name: string;
    otp: string;
  };
  [DomainEvent.PASSWORD_RESET_COMPLETED]: {
    email: string;
    name: string;
  };
  [DomainEvent.PASSWORD_CHANGED]: {
    name: string;
    email: string;
    deactivate_url?: string;
  };
  [DomainEvent.ORDER_CREATED]: {
    email: string;
    orderId: string;
    amount: number | string;
    date: string;
    dashboard_url?: string;
  };
  [DomainEvent.ORDER_CANCELLED]: {
    email: string;
    orderId: string;
  };
  [DomainEvent.ORDER_STATUS_UPDATED]: {
    email: string;
    orderId: string;
    newStatus: string;
  };
  [DomainEvent.COMPANY_ONBOARDED]: {
    email: string;
    adminName: string;
    companyName: string;
    dashboard_url?: string;
  };
  [DomainEvent.INSTALLMENT_PAID]: {
    email: string;
    customerName: string;
    productName: string;
    amountPaid: string | number;
    nextDueDate: string;
    percentagePaid: number;
    dashboard_url?: string;
  };
  [DomainEvent.MARKETER_ACCOUNT_DELETED]: {
    marketerEmail: string;
    marketerName: string;
    requestId?: string;
    requestedBy: string;
    marketerId: string;
    processedAt: string;
    dashboard_url?: string;
  };

  [DomainEvent.MARKETER_TOGGLE_STATUS]: {
    marketerEmail: string;
    marketerName: string;
    requestId?: string;
    requestedBy: string;
    marketerId: string;
    status: "ACTIVE" | "SUSPENDED";
    processedAt: string;
    dashboard_url?: string;
  };

  [DomainEvent.ADMIN_ACCOUNT_DELETED]: {
    adminEmail: string;
    adminName: string;
    requestedBy: string;
    adminId: string;
    processedAt: string;
    dashboard_url?: string;
  };

  [DomainEvent.ADMIN_TOGGLE_STATUS]: {
    adminEmail: string;
    adminName: string;
    requestedBy: string;
    status: "ACTIVE" | "SUSPENDED";
    processedAt: string;
    dashboard_url?: string;
  };
  [DomainEvent.ONBOARDING_SESSION_EXPIRED]: {
    sessionId: string;
    email: string;
    customerEmail: string;
    customerName: string;
    hadKycApplication: boolean;
    marketerId: string;
    marketerEmail: string;
    marketerName: string;
    companyId: string;
    companyEmails: string[];
  };
  [DomainEvent.KYC_APPLICATION_AUTO_EXPIRED]: {
    kycApplicationId: string;
    customerEmail: string;
    customerName: string;
    hadOnboardingSession: boolean;
    marketerId: string;
    marketerEmail: string;
    marketerName: string;
    companyId: string;
    companyEmails: string[];
    dashboard_url?: string;
  };

  [DomainEvent.INSTALLMENT_REMINDER_3DAY]: Reminder3DayPayload;
  [DomainEvent.INSTALLMENT_REMINDER_1DAY]: Reminder1DayPayload;
  [DomainEvent.INSTALLMENT_DUE_TODAY]: DueTodayPayload;
  [DomainEvent.INSTALLMENT_OVERDUE_RECURRING]: OverdueRecurringPayload;
  [DomainEvent.INSTALLMENT_OVERDUE_3DAY]: Overdue3DayPayload;
  [DomainEvent.INSTALLMENT_OVERDUE_7DAY]: Overdue7DayPayload;
  [DomainEvent.COMMISSION_TRANSFER_INITIATED]: CommissionTransferInitiatedPayload;
  [DomainEvent.COMMISSION_TRANSFER_SUCCESS]: CommissionTransferSuccessPayload;
  [DomainEvent.COMMISSION_TRANSFER_FAILED]: CommissionTransferFailedPayload;
  [DomainEvent.COMMISSION_TRANSFER_REVERSED]: CommissionTransferReversedPayload;

  [DomainEvent.MERCHANT_SETTLEMENT_GENERATED]: MerchantSettlementGeneratedPayload;
  [DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_INITIATED]: MerchantSettlementTransferInitiatedPayload;
  [DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_SUCCESS]: MerchantSettlementTransferSuccessPayload;
  [DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_FAILED]: MerchantSettlementTransferFailedPayload;
  [DomainEvent.MERCHANT_SETTLEMENT_TRANSFER_REVERSED]: MerchantSettlementTransferReversedPayload;

  [DomainEvent.SUBSCRIPTION_RENEWAL_REMINDER_7DAY]: SubscriptionRenewalBase;
  [DomainEvent.SUBSCRIPTION_RENEWAL_REMINDER_3DAY]: SubscriptionRenewalBase;
  [DomainEvent.SUBSCRIPTION_EXPIRES_TODAY]: SubscriptionRenewalBase;
  [DomainEvent.SUBSCRIPTION_GRACE_PERIOD_STARTED]: SubscriptionGracePeriodPayload;
  [DomainEvent.SUBSCRIPTION_GRACE_PERIOD_EXPIRING]: SubscriptionGracePeriodPayload;
  [DomainEvent.SUBSCRIPTION_RESTRICTED]: SubscriptionRenewalBase;
}
