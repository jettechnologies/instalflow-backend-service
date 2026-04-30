import { DomainEvent } from '../event.types';
import { NotificationChannel } from '../../../shared/types';

export interface RoutedNotification {
	channels: NotificationChannel[];
	template: string;
	subject: string | ((p: any) => string);
	context: ((p: any) => Record<string, any>) | Record<string, any>;
	/** For SMS: resolve the phone number from the payload */
	phone?: (p: any) => string;
}

/**
 * Central routing table.
 * Add SMS by pushing NotificationChannel.SMS into `channels`
 * and providing a `phone` resolver once your SMS service is ready.
 */
export const EventRouter: Record<DomainEvent, RoutedNotification[]> = {
	// ─── Auth / Identity ────────────────────────────────────────────────────────

	[DomainEvent.USER_REGISTERED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'welcome',
			subject: 'Welcome to Instalflow 🎉',
			context: (p) => ({
				name: p.name,
				dashboard_url: p.dashboard_url,
			}),
		},
		// Uncomment when SMS is live:
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: "welcome-sms",
		//   subject: "",
		//   phone: (p) => p.phone,
		//   context: (p) => ({ message: `Welcome to Instalflow, ${p.name}!` }),
		// },
	],

	[DomainEvent.MARKETER_CREATED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'marketer-welcome',
			subject: 'Your Instalflow Marketer Account',
			context: (p) => ({
				name: p.name,
				email: p.email,
				tempPassword: p.tempPassword,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.OTP_REQUESTED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'otp-verification',
			subject: 'Verify Your Email - Instalflow',
			context: (p) => ({ otp: p.otp }),
		},
		// Uncomment when SMS is live:
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: "otp-sms",
		//   subject: "",
		//   phone: (p) => p.phone,
		//   context: (p) => ({ message: `Your Instalflow OTP is: ${p.otp}` }),
		// },
	],

	[DomainEvent.PASSWORD_RESET_REQUESTED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'forgot-password-otp',
			subject: 'Password Reset OTP',
			context: (p) => ({ name: p.name, otp: p.otp }),
		},
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: "password-reset-otp-sms",
		//   subject: "",
		//   phone: (p) => p.phone,
		//   context: (p) => ({ message: `Your password reset OTP: ${p.otp}` }),
		// },
	],

	[DomainEvent.PASSWORD_RESET_COMPLETED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'password-reset',
			subject: 'Your Password Has Been Reset',
			context: (p) => ({ name: p.name }),
		},
	],

	// ─── Orders ─────────────────────────────────────────────────────────────────

	[DomainEvent.ORDER_CREATED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'order-confirmation',
			subject: (p) => `Order Confirmation - #${p.orderId}`,
			context: (p) => ({
				orderId: p.orderId,
				amount: p.amount,
				date: p.date,
				dashboard_url: p.dashboard_url,
			}),
		},
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: "order-created-sms",
		//   subject: "",
		//   phone: (p) => p.phone,
		//   context: (p) => ({
		//     message: `Your Instalflow order #${p.orderId} has been placed!`,
		//   }),
		// },
	],

	[DomainEvent.ORDER_CANCELLED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'order-cancelled',
			subject: (p) => `Order Cancelled - #${p.orderId}`,
			context: (p) => ({ orderId: p.orderId }),
		},
	],

	[DomainEvent.ORDER_STATUS_UPDATED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'order-status-update',
			subject: (p) => `Order Update - #${p.orderId}`,
			context: (p) => ({ orderId: p.orderId, newStatus: p.newStatus }),
		},
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: "order-status-sms",
		//   subject: "",
		//   phone: (p) => p.phone,
		//   context: (p) => ({
		//     message: `Order #${p.orderId} is now: ${p.newStatus}`,
		//   }),
		// },
	],
};
