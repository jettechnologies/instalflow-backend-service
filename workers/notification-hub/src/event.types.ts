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
	COMMISSION_TRANSFER_INITIATED = 'commission.transfer.initiated',
	COMMISSION_TRANSFER_SUCCESS = 'commission.transfer.success',
	COMMISSION_TRANSFER_FAILED = 'commission.transfer.failed',
	COMMISSION_TRANSFER_REVERSED = 'commission.transfer.reversed',
	MARKETER_ACCOUNT_DELETED = 'marketer.account.deleted',
	MARKETER_TOGGLE_STATUS = 'marketer.toggle.status',
	ADMIN_TOGGLE_STATUS = 'admin.toggle.status',
	ADMIN_ACCOUNT_DELETED = 'admin.account.deleted',
}

export enum EventStatus {
	PENDING = 'pending',
	PROCESSED = 'processed',
	FAILED = 'failed',
}
