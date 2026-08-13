// src/events/event.types.ts

export enum DomainEvent {
	USER_REGISTERED = 'user.registered',
	STAFF_CREATED = 'staff.created',
	OTP_REQUESTED = 'auth.otp.requested',
	PASSWORD_RESET_REQUESTED = 'auth.password.reset.requested',
	PASSWORD_RESET_COMPLETED = 'auth.password.reset.completed',
	PASSWORD_CHANGED = 'auth.password.changed',
	ORDER_CREATED = 'order.created',
	ORDER_CANCELLED = 'order.cancelled',
	ORDER_STATUS_UPDATED = 'order.status.updated',
	COMPANY_ONBOARDED = 'company.onboarded',
	INSTALLMENT_PAID = 'installment.paid',
	INSTALLMENT_REMINDER_3DAY = 'installment.reminder.3day',
	INSTALLMENT_REMINDER_1DAY = 'installment.reminder.1day',
	INSTALLMENT_DUE_TODAY = 'installment.due.today',
	INSTALLMENT_OVERDUE_RECURRING = 'installment.overdue.recurring',
	INSTALLMENT_OVERDUE_3DAY = 'installment.overdue.3day',
	INSTALLMENT_OVERDUE_7DAY = 'installment.overdue.7day',
	COMMISSION_TRANSFER_INITIATED = 'commission.transfer.initiated',
	COMMISSION_TRANSFER_SUCCESS = 'commission.transfer.success',
	COMMISSION_TRANSFER_FAILED = 'commission.transfer.failed',
	COMMISSION_TRANSFER_REVERSED = 'commission.transfer.reversed',
	MARKETER_ACCOUNT_DELETED = 'marketer.account.deleted',
	MARKETER_TOGGLE_STATUS = 'marketer.toggle.status',
	ADMIN_TOGGLE_STATUS = 'admin.toggle.status',
	ADMIN_ACCOUNT_DELETED = 'admin.account.deleted',
	KYC_APPLICATION_AUTO_EXPIRED = 'kyc.application.auto-expired',

	MERCHANT_SETTLEMENT_GENERATED = 'merchant_settlement.generated',
	MERCHANT_SETTLEMENT_TRANSFER_INITIATED = 'merchant_settlement.transfer.initiated',
	MERCHANT_SETTLEMENT_TRANSFER_SUCCESS = 'merchant_settlement.transfer.success',
	MERCHANT_SETTLEMENT_TRANSFER_FAILED = 'merchant_settlement.transfer.failed',
	MERCHANT_SETTLEMENT_TRANSFER_REVERSED = 'merchant_settlement.transfer.reversed',

	SUBSCRIPTION_RENEWAL_REMINDER_7DAY = 'subscription.renewal.reminder.7day',
	SUBSCRIPTION_RENEWAL_REMINDER_3DAY = 'subscription.renewal.reminder.3day',
	SUBSCRIPTION_EXPIRES_TODAY = 'subscription.expires.today',
	SUBSCRIPTION_GRACE_PERIOD_STARTED = 'subscription.grace_period.started',
	SUBSCRIPTION_GRACE_PERIOD_EXPIRING = 'subscription.grace_period.expiring',
	SUBSCRIPTION_RESTRICTED = 'subscription.restricted',
}

export enum EventStatus {
	PENDING = 'pending',
	PROCESSED = 'processed',
	FAILED = 'failed',
}
