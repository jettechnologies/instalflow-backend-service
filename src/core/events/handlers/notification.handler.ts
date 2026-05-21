// src/core/events/handlers/notification.handler.ts

import { onEvent } from "@/core/events/emitter-secondary";
import { DomainEvent } from "@/core/events/event.types";
import { NotificationService } from "@/core/notifications/notification.service";
import { NotificationChannel } from "@/core/notifications/notification.type";
import { EmailTemplate } from "@/core/services/email.service";

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
      dueDate: payload.dueDate,
      percentagePaid: payload.percentagePaid,
      dashboard_url: process.env.FRONTEND_URL,
    },
  });
});
