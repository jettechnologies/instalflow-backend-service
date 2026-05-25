import { DomainEvent } from '../event.types';
import { NotificationChannel } from '../../../shared/types';

export interface RoutedNotification {
	channels: NotificationChannel[];
	template: string | ((p: any) => string);
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
			template: (p) => {
				const isCustomer = p.role === 'CUSTOMER' || !!p.applicationUnderReview || !!p.rejectionReason;
				return isCustomer ? 'welcome-customer' : 'welcome';
			},
			subject: (p) => {
				const isCustomer = p.role === 'CUSTOMER' || !!p.applicationUnderReview || !!p.rejectionReason;
				if (!isCustomer) return 'Welcome to Instalflow 🎉';
				if (p.rejectionReason) return 'Your Installment Application was Declined ❌';
				return p.applicationUnderReview ? 'Your Installment Application is Under Review 📝' : 'Welcome to Instalflow 🎉';
			},
			context: (p) => ({
				name: p.name,
				dashboard_url: p.dashboard_url,
				applicationUnderReview: p.applicationUnderReview || false,
				rejectionReason: p.rejectionReason,
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

	[DomainEvent.STAFF_CREATED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'staff-welcome',
			subject: (p) => `Your Instalflow ${p.role} Account`,
			context: (p) => ({
				name: p.name,
				email: p.email,
				role: p.role,
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
			context: (p) => ({ email: p.email, name: p.name, otp: p.otp }),
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
			context: (p) => ({ name: p.name, email: p.email }),
		},
	],
	[DomainEvent.PASSWORD_CHANGED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'password-changed',
			subject: 'Password Changed Successfully',
			context: (p) => ({ name: p.name, email: p.email, deactivate_url: p.deactivate_url }),
		},
	],

	[DomainEvent.COMPANY_ONBOARDED]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'company-onboarding',
			subject: 'Welcome to Instalflow! Your Company is Ready 🚀',
			context: (p) => ({
				adminName: p.adminName,
				companyName: p.companyName,
				dashboard_url: p.dashboard_url,
			}),
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

	// ─── Installments ────────────────────────────────────────────────────────────

	[DomainEvent.INSTALLMENT_PAID]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'installment-paid',
			subject: (p) => `Installment Paid Successfully! 🎉`,
			context: (p) => ({
				customerName: p.customerName,
				productName: p.productName,
				amountPaid: p.amountPaid,
				nextDueDate: p.nextDueDate,
				percentagePaid: p.percentagePaid,
				dashboard_url: p.dashboard_url,
			}),
		},
		// Uncomment when SMS is live:
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: 'installment-paid-sms',
		//   subject: '',
		//   phone: (p) => p.phone,
		//   context: (p) => ({
		//     message: `Hi ${p.customerName}, your installment for ${p.productName} has been cleared. Progress: ${p.percentagePaid}%`,
		//   }),
		// },
	],

	[DomainEvent.INSTALLMENT_REMINDER_3DAY]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'installment-reminder-3day',
			subject: (p) => `Reminder: Installment Due in 3 Days 🎉`,
			context: (p) => ({
				customerId: p.customerId,
				customerEmail: p.customerEmail,
				customerName: p.customerName,
				installmentId: p.installmentId,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				productName: p.productName,
				variantName: p.variantName,
				percentagePaid: p.percentagePaid,
				payment_url: p.payment_url,
				dashboard_url: p.dashboard_url,
			}),
		},
		// Uncomment when SMS is live:
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: 'installment-reminder-3day-sms',
		//   subject: '',
		//   phone: (p) => p.phone,
		//   context: (p) => ({
		//     message: `Hi ${p.customerName}, your installment for ${p.productName} is due in 3 days. Please clear the payment.`,
		//   }),
		// },
	],

	[DomainEvent.INSTALLMENT_DUE_TODAY]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'installment-due-today',
			subject: (p) => `Reminder: Installment Due Today 🎉`,
			context: (p) => ({
				customerId: p.customerId,
				customerEmail: p.customerEmail,
				customerName: p.customerName,
				installmentId: p.installmentId,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				productName: p.productName,
				variantName: p.variantName,
				percentagePaid: p.percentagePaid,
				payment_url: p.payment_url,
				dashboard_url: p.dashboard_url,
			}),
		},
		// Uncomment when SMS is live:
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: 'installment-due-today-sms',
		//   subject: '',
		//   phone: (p) => p.phone,
		//   context: (p) => ({
		//     message: `Hi ${p.customerName}, your installment for ${p.productName} is due today. Please clear the payment.`,
		//   }),
		// },
	],

	[DomainEvent.INSTALLMENT_OVERDUE_3DAY]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'installment-overdue-3day',
			subject: (p) => `Reminder: Installment Overdue - 3 Days ⚠️`,
			context: (p) => ({
				customerId: p.customerId,
				customerEmail: p.customerEmail,
				customerName: p.customerName,
				installmentId: p.installmentId,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				productName: p.productName,
				variantName: p.variantName,
				percentagePaid: p.percentagePaid,
				marketerId: p.marketerId,
				marketerEmail: p.marketerEmail,
				marketerName: p.marketerName,
				payment_url: p.payment_url,
			}),
		},
		// Uncomment when SMS is live:
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: 'installment-overdue-3day-sms',
		//   subject: '',
		//   phone: (p) => p.phone,
		//   context: (p) => ({
		//     message: `Hi ${p.customerName}, your installment for ${p.productName} is overdue by 3 days. Please clear the payment.`,
		//   }),
		// },
	],

	[DomainEvent.INSTALLMENT_OVERDUE_7DAY]: [
		{
			channels: [NotificationChannel.EMAIL],
			template: 'installment-overdue-7day',
			subject: (p) => `Reminder: Installment Overdue - 7 Days ⚠️`,
			context: (p) => ({
				customerId: p.customerId,
				customerEmail: p.customerEmail,
				customerName: p.customerName,
				installmentId: p.installmentId,
				sequence: p.sequence,
				dueDate: p.dueDate,
				expectedPaymentDate: p.expectedPaymentDate,
				amount: p.amount,
				productName: p.productName,
				variantName: p.variantName,
				percentagePaid: p.percentagePaid,
				marketerId: p.marketerId,
				marketerEmail: p.marketerEmail,
				marketerName: p.marketerName,
				adminId: p.adminId,
				adminEmail: p.adminEmail,
				adminName: p.adminName,
				payment_url: p.payment_url,
				dashboard_url: p.dashboard_url,
			}),
		},
		// Uncomment when SMS is live:
		// {
		//   channels: [NotificationChannel.SMS],
		//   template: 'installment-overdue-7day-sms',
		//   subject: '',
		//   phone: (p) => p.phone,
		//   context: (p) => ({
		//     message: `Hi ${p.customerName}, your installment for ${p.productName} is overdue by 7 days. Please clear the payment.`,
		//   }),
		// },
	],
};
