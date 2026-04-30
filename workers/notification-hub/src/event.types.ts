// src/events/event.types.ts

export enum DomainEvent {
	// Auth / Identity
	USER_REGISTERED = 'user.registered',
	MARKETER_CREATED = 'marketer.created',
	OTP_REQUESTED = 'auth.otp.requested',
	PASSWORD_RESET_REQUESTED = 'auth.password.reset.requested',
	PASSWORD_RESET_COMPLETED = 'auth.password.reset.completed',

	// Orders
	ORDER_CREATED = 'order.created',
	ORDER_CANCELLED = 'order.cancelled',
	ORDER_STATUS_UPDATED = 'order.status.updated',
}

export enum EventStatus {
	PENDING = 'pending',
	PROCESSED = 'processed',
	FAILED = 'failed',
}
