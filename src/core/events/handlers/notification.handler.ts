import { onEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import { NotificationService } from "@/core/notifications/notification.service";
import { NotificationChannel } from "@/core/notifications/notification.type";
import { EmailTemplate } from "@/core/services/email.service";
import { NotificationOrchestrator } from "@/infrastructure/internal_notification/notification.orchestrator";
import { NotificationRepository } from "@/infrastructure/internal_notification/notification.repository";
import { NotificationEventType } from "@/infrastructure/internal_notification/notification.types";

const fmt = (amount: string | number) =>
  typeof amount === "number" ? `₦${amount.toLocaleString()}` : amount;

/**
 * USER REGISTERED
 */
onEvent(DomainEvent.USER_REGISTERED, async (payload) => {
  const isCustomer =
    payload.role === "CUSTOMER" || !!payload.applicationUnderReview;
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: isCustomer
      ? EmailTemplate.WELCOME_CUSTOMER
      : EmailTemplate.WELCOME,
    subject: isCustomer
      ? payload.applicationUnderReview
        ? "Your Installment Application is Under Review 📝"
        : "Welcome to Instalflow 🎉"
      : "Welcome to Instalflow 🎉",
    context: {
      name: payload.name,
      dashboard_url: process.env.FRONTEND_URL,
      applicationUnderReview: payload.applicationUnderReview || false,
    },
  });
});

/**
 * STAFF CREATED
 */
onEvent(DomainEvent.STAFF_CREATED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.STAFF_WELCOME,
    subject: `Your Instalflow ${payload.role} Account`,
    context: {
      name: payload.name,
      email: payload.email,
      role: payload.role,
      tempPassword: payload.tempPassword,
      dashboard_url: process.env.FRONTEND_URL,
    },
  });
});

/**
 * OTP REQUESTED (NEW)
 */
onEvent(DomainEvent.OTP_REQUESTED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.OTP_VERIFICATION,
    subject: "Verify Your Email - Instalflow",
    context: {
      otp: payload.otp,
    },
  });
});

/**
 * PASSWORD RESET REQUESTED (OTP FLOW)
 */
onEvent(DomainEvent.PASSWORD_RESET_REQUESTED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.FORGOT_PASSWORD_OTP,
    subject: "Password Reset OTP",
    context: {
      name: payload.name,
      otp: payload.otp,
    },
  });
});

/**
 * PASSWORD RESET COMPLETED (NEW)
 */
onEvent(DomainEvent.PASSWORD_RESET_COMPLETED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.PASSWORD_RESET,
    subject: "Your Password Has Been Reset",
    context: {
      name: payload.name,
    },
  });
});

onEvent(DomainEvent.PASSWORD_CHANGED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.PASSWORD_CHANGED,
    subject: "Password Changed Successfully",
    context: {
      name: payload.name,
      deactivate_url: payload.deactivate_url,
    },
  });
});

/**
 * ORDER CREATED
 */
onEvent(DomainEvent.ORDER_CREATED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.ORDER_CONFIRMATION,
    subject: `Order Confirmation - #${payload.orderId}`,
    context: {
      orderId: payload.orderId,
      amount: payload.amount,
      date: payload.date,
      dashboard_url: process.env.FRONTEND_URL,
    },
  });
});

/**
 * ORDER CANCELLED
 */
onEvent(DomainEvent.ORDER_CANCELLED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.ORDER_CANCELLED,
    subject: `Order Cancelled - #${payload.orderId}`,
    context: {
      orderId: payload.orderId,
    },
  });
});

/**
 * ORDER STATUS UPDATED (NEW)
 */
onEvent(DomainEvent.ORDER_STATUS_UPDATED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.ORDER_STATUS_UPDATE,
    subject: `Order Update - #${payload.orderId}`,
    context: {
      orderId: payload.orderId,
      newStatus: payload.newStatus,
    },
  });
});

/**
 * COMPANY ONBOARDED
 */
onEvent(DomainEvent.COMPANY_ONBOARDED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.COMPANY_ONBOARDING,
    subject: "Welcome to Instalflow! Your Company is Ready 🚀",
    context: {
      adminName: payload.adminName,
      companyName: payload.companyName,
      dashboard_url: process.env.FRONTEND_URL,
    },
  });
});

/**
 * INSTALLMENT PAID SUCCESSFULLY
 */
onEvent(DomainEvent.INSTALLMENT_PAID, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.INSTALLMENT_PAID,
    subject: `Installment Paid Successfully! 🎉`,
    context: {
      customerName: payload.customerName,
      productName: payload.productName,
      amountPaid: payload.amountPaid,
      nextDueDate: payload.nextDueDate,
      percentagePaid: payload.percentagePaid,
      dashboard_url: process.env.FRONTEND_URL,
    },
  });
});

// ─── 1. 3 DAYS BEFORE DUE ────────────────────────────────────────────────────

onEvent(DomainEvent.INSTALLMENT_REMINDER_3DAY, async (payload) => {
  // Email
  await NotificationService.send({
    to: payload.customerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.INSTALLMENT_REMINDER_3DAY,
    subject: `⏰ Payment Reminder: ₦ due in 3 days`,
    context: {
      customerName: payload.customerName,
      productName: payload.productName,
      variantName: payload.variantName,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      percentagePaid: payload.percentagePaid,
      payment_url: payload.payment_url ?? process.env.FRONTEND_URL,
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  await NotificationOrchestrator.handle(
    NotificationEventType.INSTALLMENT_REMINDER_3DAY,
    {
      customerId: payload.customerId,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      installmentId: payload.installmentId,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      productName: payload.productName,
      variantName: payload.variantName,
      percentagePaid: payload.percentagePaid,
      payment_url: payload.payment_url,
      dashboard_url: payload.dashboard_url,
    },
  );
});

onEvent(DomainEvent.INSTALLMENT_DUE_TODAY, async (payload) => {
  await NotificationService.send({
    to: payload.customerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.INSTALLMENT_DUE_TODAY,
    subject: `🔔 Your Installment Payment is Due Today`,
    context: {
      customerName: payload.customerName,
      productName: payload.productName,
      variantName: payload.variantName,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      percentagePaid: payload.percentagePaid,
      payment_url: payload.payment_url ?? process.env.FRONTEND_URL,
    },
  });

  await NotificationOrchestrator.handle(
    NotificationEventType.INSTALLMENT_DUE_TODAY,
    {
      customerId: payload.customerId,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      installmentId: payload.installmentId,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      productName: payload.productName,
      variantName: payload.variantName,
      percentagePaid: payload.percentagePaid,
      payment_url: payload.payment_url,
      dashboard_url: payload.dashboard_url,
    },
  );
});

onEvent(DomainEvent.INSTALLMENT_OVERDUE_3DAY, async (payload) => {
  await NotificationService.send({
    to: payload.customerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.INSTALLMENT_OVERDUE_3DAY_CUSTOMER,
    subject: `⚠️ Overdue Payment: Action Required`,
    context: {
      customerName: payload.customerName,
      productName: payload.productName,
      variantName: payload.variantName,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      percentagePaid: payload.percentagePaid,
      payment_url: payload.payment_url ?? process.env.FRONTEND_URL,
    },
  });

  await NotificationService.send({
    to: payload.marketerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.INSTALLMENT_OVERDUE_3DAY_MARKETER,
    subject: `⚠️ Customer Payment Overdue (3 Days) — Action Needed`,
    context: {
      marketerName: payload.marketerName,
      customerName: payload.customerName,
      productName: payload.productName,
      variantName: payload.variantName,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      percentagePaid: payload.percentagePaid,
    },
  });

  await NotificationOrchestrator.handle(
    NotificationEventType.INSTALLMENT_OVERDUE_3DAY,
    {
      customerId: payload.customerId,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      installmentId: payload.installmentId,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      productName: payload.productName,
      variantName: payload.variantName,
      percentagePaid: payload.percentagePaid,
      marketerId: payload.marketerId,
      marketerEmail: payload.marketerEmail,
      marketerName: payload.marketerName,
      payment_url: payload.payment_url,
    },
  );
});

onEvent(DomainEvent.INSTALLMENT_OVERDUE_7DAY, async (payload) => {
  await NotificationService.send({
    to: payload.customerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.INSTALLMENT_OVERDUE_7DAY_CUSTOMER,
    subject: `🚨 URGENT: Overdue Payment — Immediate Action Required`,
    context: {
      customerName: payload.customerName,
      productName: payload.productName,
      variantName: payload.variantName,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      amount: payload.amount,
      percentagePaid: payload.percentagePaid,
      payment_url: payload.payment_url ?? process.env.FRONTEND_URL,
    },
  });

  await NotificationService.send({
    to: payload.adminEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.INSTALLMENT_OVERDUE_7DAY_ADMIN,
    subject: `🚨 Escalation: 7-Day Overdue Installment — ${payload.customerName}`,
    context: {
      adminName: payload.adminName,
      marketerName: payload.marketerName,
      customerName: payload.customerName,
      productName: payload.productName,
      variantName: payload.variantName,
      sequence: payload.sequence,
      expectedPaymentDate: payload.expectedPaymentDate,
      amount: payload.amount,
      percentagePaid: payload.percentagePaid,
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  await NotificationOrchestrator.handle(
    NotificationEventType.INSTALLMENT_OVERDUE_7DAY,
    {
      customerId: payload.customerId,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      installmentId: payload.installmentId,
      sequence: payload.sequence,
      dueDate: payload.dueDate,
      expectedPaymentDate: payload.expectedPaymentDate,
      amount: payload.amount,
      productName: payload.productName,
      variantName: payload.variantName,
      percentagePaid: payload.percentagePaid,
      marketerId: payload.marketerId,
      marketerEmail: payload.marketerEmail,
      marketerName: payload.marketerName,
      adminId: payload.adminId,
      adminEmail: payload.adminEmail,
      adminName: payload.adminName,
      payment_url: payload.payment_url,
      dashboard_url: payload.dashboard_url,
    },
  );
});
// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION TRANSFER INITIATED
// Called from: transfer.worker after PaystackService.initiateTransfer succeeds
// ─────────────────────────────────────────────────────────────────────────────

onEvent(DomainEvent.COMMISSION_TRANSFER_INITIATED, async (payload) => {
  // External email → marketer only
  await NotificationService.send({
    to: payload.marketerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.COMMISSION_TRANSFER_INITIATED,
    subject: `Your Payout is Being Processed 🔄`,
    context: {
      marketerName: payload.marketerName,
      amount: fmt(payload.amount),
      bankName: payload.bankName,
      maskedAccount: payload.maskedAccount,
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  // Internal notification → marketer
  await NotificationOrchestrator.handle(
    NotificationEventType.COMMISSION_TRANSFER_INITIATED,
    {
      payoutId: payload.payoutId,
      marketerId: payload.marketerId,
      marketerName: payload.marketerName,
      amount: payload.amount,
      bankName: payload.bankName,
      maskedAccount: payload.maskedAccount,
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION TRANSFER SUCCESS
// Called from: webhook handleTransferSuccess after ledger is committed
// ─────────────────────────────────────────────────────────────────────────────

onEvent(DomainEvent.COMMISSION_TRANSFER_SUCCESS, async (payload) => {
  // External email → marketer
  await NotificationService.send({
    to: payload.marketerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.COMMISSION_TRANSFER_SUCCESS,
    subject: `Your Payout Has Been Sent! 💸`,
    context: {
      marketerName: payload.marketerName,
      amount: fmt(payload.amount),
      transferCode: payload.transferCode,
      bankName: payload.bankName,
      maskedAccount: payload.maskedAccount,
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  // External email → each company approver (audit/confirmation copy)
  await Promise.all(
    payload.companyEmails.map((email) =>
      NotificationService.send({
        to: email,
        channel: NotificationChannel.EMAIL,
        template: EmailTemplate.COMMISSION_TRANSFER_SUCCESS_COMPANY,
        subject: `✅ Payout Confirmed — ${payload.marketerName}`,
        context: {
          marketerName: payload.marketerName,
          amount: fmt(payload.amount),
          transferCode: payload.transferCode,
          dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
        },
      }),
    ),
  );

  // Internal notifications → marketer + company users
  await NotificationOrchestrator.handle(
    NotificationEventType.COMMISSION_TRANSFER_SUCCESS,
    {
      payoutId: payload.payoutId,
      marketerId: payload.marketerId,
      marketerName: payload.marketerName,
      amount: payload.amount,
      transferCode: payload.transferCode,
      bankName: payload.bankName,
      maskedAccount: payload.maskedAccount,
      companyId: payload.companyId,
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION TRANSFER FAILED
// Called from: webhook handleTransferFailed after ledger reversal is committed
// ─────────────────────────────────────────────────────────────────────────────

onEvent(DomainEvent.COMMISSION_TRANSFER_FAILED, async (payload) => {
  // External email → marketer
  await NotificationService.send({
    to: payload.marketerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.COMMISSION_TRANSFER_FAILED_MARKETER,
    subject: `Payout Transfer Failed — We're Looking Into It`,
    context: {
      marketerName: payload.marketerName,
      amount: fmt(payload.amount),
      reason: payload.reason,
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  // External email → each company approver (action required: retry)
  await Promise.all(
    payload.companyEmails.map((email) =>
      NotificationService.send({
        to: email,
        channel: NotificationChannel.EMAIL,
        template: EmailTemplate.COMMISSION_TRANSFER_FAILED_COMPANY,
        subject: `⚠️ Payout Failed — ${payload.marketerName} (Action Required)`,
        context: {
          marketerName: payload.marketerName,
          amount: fmt(payload.amount),
          reason: payload.reason,
          payoutId: payload.payoutId,
          dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
        },
      }),
    ),
  );

  // Internal notifications → marketer + company users
  await NotificationOrchestrator.handle(
    NotificationEventType.COMMISSION_TRANSFER_FAILED,
    {
      payoutId: payload.payoutId,
      marketerId: payload.marketerId,
      marketerName: payload.marketerName,
      amount: payload.amount,
      reason: payload.reason,
      companyId: payload.companyId,
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION TRANSFER REVERSED
// Called from: webhook handleTransferReversed after ledger reversal is committed
// ─────────────────────────────────────────────────────────────────────────────

onEvent(DomainEvent.COMMISSION_TRANSFER_REVERSED, async (payload) => {
  // External email → marketer
  await NotificationService.send({
    to: payload.marketerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.COMMISSION_TRANSFER_REVERSED_MARKETER,
    subject: `Your Payout Was Reversed — Commission Restored`,
    context: {
      marketerName: payload.marketerName,
      amount: fmt(payload.amount),
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  // External email → each company approver
  await Promise.all(
    payload.companyEmails.map((email) =>
      NotificationService.send({
        to: email,
        channel: NotificationChannel.EMAIL,
        template: EmailTemplate.COMMISSION_TRANSFER_REVERSED_COMPANY,
        subject: `⚠️ Transfer Reversed — ${payload.marketerName}`,
        context: {
          marketerName: payload.marketerName,
          amount: fmt(payload.amount),
          payoutId: payload.payoutId,
          dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
        },
      }),
    ),
  );

  // Internal notifications → marketer + company users
  await NotificationOrchestrator.handle(
    NotificationEventType.COMMISSION_TRANSFER_REVERSED,
    {
      payoutId: payload.payoutId,
      marketerId: payload.marketerId,
      marketerName: payload.marketerName,
      amount: payload.amount,
      companyId: payload.companyId,
    },
  );
});

onEvent(DomainEvent.MARKETER_ACCOUNT_DELETED, async (payload) => {
  await NotificationService.send({
    to: payload.marketerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.MARKETER_ACCOUNT_DELETED,
    subject: `Account Closure: ${payload.marketerName}`,
    context: {
      marketerName: payload.marketerName,
      reqestedBy: payload.requestedBy,
      processedAt: payload.processedAt,
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  if (payload.requestId) {
    await NotificationOrchestrator.handle(
      NotificationEventType.MARKETER_DELETE_APPROVED,
      {
        requestId: payload.requestId,
        marketerId: payload.marketerId,
        marketerName: payload.marketerName,
      },
    );
  }
});

onEvent(DomainEvent.MARKETER_TOGGLE_STATUS, async (payload) => {
  await NotificationService.send({
    to: payload.marketerEmail,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.MARKETER_TOGGLE_STATUS,
    subject:
      payload.status === "ACTIVE" ? "Account Reactivated" : "Account Suspended",
    context: {
      marketerName: payload.marketerName,
      requestedBy: payload.requestedBy,
      processedAt: payload.processedAt,
      status: payload.status,
      statusColor: payload.status === "ACTIVE" ? "#22c55e" : "#f59e0b",
      statusBg:
        payload.status === "ACTIVE"
          ? "rgba(34,197,94,0.12)"
          : "rgba(245,158,11,0.12)",
      title:
        payload.status === "ACTIVE"
          ? "Account Reactivated"
          : "Account Suspended",
      note:
        payload.status === "ACTIVE"
          ? "Good news — your account has been reactivated and you can now continue using the platform."
          : "Your account has been suspended due to administrative action. Access has been temporarily disabled.",
      dashboard_url: payload.dashboard_url ?? process.env.FRONTEND_URL,
    },
  });

  if (payload.requestId) {
    await NotificationOrchestrator.handle(
      NotificationEventType.MARKETER_TOGGLE_APPROVED,
      {
        requestId: payload.requestId,
        marketerId: payload.marketerId,
        marketerName: payload.marketerName,
      },
    );
  }
});
