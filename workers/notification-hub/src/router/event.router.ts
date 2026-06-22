import { DomainEvent } from '../event.types';
import { NotificationChannel } from '../../../shared/types';

export interface RoutedNotification {
	channels: NotificationChannel[];
	template: string | ((p: any) => string);
	subject: string | ((p: any) => string);
	context: ((p: any) => Record<string, any>) | Record<string, any>;
	/** For SMS: resolve the phone number from the payload */
	phone?: (p: any) => string;
	/** For Email: resolve the recipient email from the payload */
	to?: (p: any) => string;
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
			to: (p) => p.customerEmail,
			template: 'installment-3days-reminder',
			subject: (p) => `⏰ Payment Reminder: ${p.amount} due in 3 days`,
			context: (p) => ({
				customerName: p.customerName,
				productName: p.productName,
				variantName: p.variantName,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				percentagePaid: p.percentagePaid,
				payment_url: p.payment_url,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.INSTALLMENT_DUE_TODAY]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.customerEmail,
			template: 'installment-due',
			subject: (p) => `🔔 Your Installment Payment is Due Today`,
			context: (p) => ({
				customerName: p.customerName,
				productName: p.productName,
				variantName: p.variantName,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				percentagePaid: p.percentagePaid,
				payment_url: p.payment_url,
			}),
		},
	],

	[DomainEvent.INSTALLMENT_OVERDUE_3DAY]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.customerEmail,
			template: 'installment-overdue-3days-customer',
			subject: (p) => `⚠️ Overdue Payment: Action Required`,
			context: (p) => ({
				customerName: p.customerName,
				productName: p.productName,
				variantName: p.variantName,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				percentagePaid: p.percentagePaid,
				payment_url: p.payment_url,
			}),
		},
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.marketerEmail,
			template: 'installment-overdue-3days-marketer',
			subject: (p) => `⚠️ Customer Payment Overdue (3 Days) — Action Needed`,
			context: (p) => ({
				marketerName: p.marketerName,
				customerName: p.customerName,
				productName: p.productName,
				variantName: p.variantName,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				percentagePaid: p.percentagePaid,
			}),
		},
	],

	[DomainEvent.INSTALLMENT_OVERDUE_7DAY]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.customerEmail,
			template: 'installment-overdue-7days-customer',
			subject: (p) => `🚨 URGENT: Overdue Payment — Immediate Action Required`,
			context: (p) => ({
				customerName: p.customerName,
				productName: p.productName,
				variantName: p.variantName,
				sequence: p.sequence,
				dueDate: p.dueDate,
				amount: p.amount,
				percentagePaid: p.percentagePaid,
				payment_url: p.payment_url,
			}),
		},
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.adminEmail,
			template: 'installment-overdue-7days-admin',
			subject: (p) => `🚨 Escalation: 7-Day Overdue Installment — ${p.customerName}`,
			context: (p) => ({
				adminName: p.adminName,
				marketerName: p.marketerName,
				customerName: p.customerName,
				productName: p.productName,
				variantName: p.variantName,
				sequence: p.sequence,
				expectedPaymentDate: p.expectedPaymentDate,
				amount: p.amount,
				percentagePaid: p.percentagePaid,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.COMMISSION_TRANSFER_INITIATED]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.marketerEmail,
			template: 'commission-transfer-initiated',
			subject: 'Your Payout is Being Processed 🔄',
			context: (p) => ({
				marketerName: p.marketerName,
				amount: p.amount,
				payoutId: p.payoutId,
				bankName: p.bankName,
				maskedAccount: p.maskedAccount,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.COMMISSION_TRANSFER_SUCCESS]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.marketerEmail,
			template: 'commission-transfer-success',
			subject: 'Your Payout Has Been Sent! 💸',
			context: (p) => ({
				marketerName: p.marketerName,
				amount: p.amount,
				payoutId: p.payoutId,
				transferCode: p.transferCode,
				bankName: p.bankName,
				maskedAccount: p.maskedAccount,
				dashboard_url: p.dashboard_url,
			}),
		},
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.companyEmails,
			template: 'commission-transfer-success-company',
			subject: (p) => `✅ Payout Confirmed — ${p.marketerName}`,
			context: (p) => ({
				marketerName: p.marketerName,
				amount: p.amount,
				payoutId: p.payoutId,
				transferCode: p.transferCode,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.COMMISSION_TRANSFER_FAILED]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.marketerEmail,
			template: 'commission-transfer-failed-marketer',
			subject: "Payout Transfer Failed — We're Looking Into It",
			context: (p) => ({
				marketerName: p.marketerName,
				amount: p.amount,
				payoutId: p.payoutId,
				reason: p.reason,
				dashboard_url: p.dashboard_url,
			}),
		},
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.companyEmails,
			template: 'commission-transfer-failed-company',
			subject: (p) => `⚠️ Payout Failed — ${p.marketerName} (Action Required)`,
			context: (p) => ({
				marketerName: p.marketerName,
				amount: p.amount,
				payoutId: p.payoutId,
				reason: p.reason,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.COMMISSION_TRANSFER_REVERSED]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.marketerEmail,
			template: 'commission-transfer-reversed-marketer',
			subject: 'Your Payout Was Reversed — Commission Restored',
			context: (p) => ({
				marketerName: p.marketerName,
				amount: p.amount,
				payoutId: p.payoutId,
				dashboard_url: p.dashboard_url,
			}),
		},
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.companyEmails,
			template: 'commission-transfer-reversed-company',
			subject: (p) => `⚠️ Transfer Reversed — ${p.marketerName}`,
			context: (p) => ({
				marketerName: p.marketerName,
				amount: p.amount,
				payoutId: p.payoutId,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.MARKETER_ACCOUNT_DELETED]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.marketerEmail,
			template: 'marketer-account-deleted',
			subject: (p) => `Account Closure: ${p.marketerName}`,
			context: (p) => ({
				marketerName: p.marketerName,
				reqestedBy: p.requestedBy,
				processedAt: p.processedAt,
				dashboard_url: p.dashboard_url,
			}),
		},
	],

	[DomainEvent.MARKETER_TOGGLE_STATUS]: [
		{
			channels: [NotificationChannel.EMAIL],
			to: (p) => p.marketerEmail,
			template: 'marketer-account-toggle',
			subject: (p) => (p.status === 'ACTIVE' ? 'Account Reactivated' : 'Account Suspended'),
			context: (p) => ({
				marketerName: p.marketerName,
				requestedBy: p.requestedBy,
				processedAt: p.processedAt,
				status: p.status,
				statusColor: p.status === 'ACTIVE' ? '#22c55e' : '#f59e0b',
				statusBg: p.status === 'ACTIVE' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
				title: p.status === 'ACTIVE' ? 'Account Reactivated' : 'Account Suspended',
				note:
					p.status === 'ACTIVE'
						? 'Good news — your account has been reactivated and you can now continue using the platform.'
						: 'Your account has been suspended due to administrative action. Access has been temporarily disabled.',
				dashboard_url: p.dashboard_url,
			}),
		},
	],
};
