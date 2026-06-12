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
	INSTALLMENT_DUE_TODAY = 'installment.due.today',
	INSTALLMENT_OVERDUE_3DAY = 'installment.overdue.3day',
	INSTALLMENT_OVERDUE_7DAY = 'installment.overdue.7day',
	COMMISSION_TRANSFER_INITIATED = 'commission-transfer-initiated',
	COMMISSION_TRANSFER_SUCCESS = 'commission-transfer-success',
	COMMISSION_TRANSFER_SUCCESS_COMPANY = 'commission-transfer-success-company',
	COMMISSION_TRANSFER_FAILED_MARKETER = 'commission-transfer-failed-marketer',
	COMMISSION_TRANSFER_FAILED_COMPANY = 'commission-transfer-failed-company',
	COMMISSION_TRANSFER_REVERSED_MARKETER = 'commission-transfer-reversed-marketer',
	COMMISSION_TRANSFER_REVERSED_COMPANY = 'commission-transfer-reversed-company',
}

export enum EventStatus {
	PENDING = 'pending',
	PROCESSED = 'processed',
	FAILED = 'failed',
}
