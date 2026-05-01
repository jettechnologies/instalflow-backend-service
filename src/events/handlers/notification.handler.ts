// src/events/handlers/notification.handler.ts

import { onEvent } from "../emitter-secondary";
import { DomainEvent } from "../event.types";
import { NotificationService } from "../../notifications/notification.service";
import { NotificationChannel } from "@/notifications/notification.type";
import { EmailTemplate } from "../../services/email.service";

/**
 * USER REGISTERED
 */
onEvent(DomainEvent.USER_REGISTERED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.WELCOME,
    subject: "Welcome to Instalflow 🎉",
    context: {
      name: payload.name,
      dashboard_url: process.env.FRONTEND_URL,
    },
  });
});

/**
 * MARKETER CREATED
 */
onEvent(DomainEvent.MARKETER_CREATED, async (payload) => {
  await NotificationService.send({
    to: payload.email,
    channel: NotificationChannel.EMAIL,
    template: EmailTemplate.MARKETER_WELCOME,
    subject: "Your Instalflow Marketer Account",
    context: {
      name: payload.name,
      email: payload.email,
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

// // src/events/handlers/notification.handler.ts
// import { onEvent } from "../emitter";
// import { DomainEvent } from "../event.types";
// import { NotificationService } from "../../notifications/notification.service";
// import { NotificationChannel } from "@/notifications/notification.type";
// import { EmailTemplate } from "../../services/email.service";

// // USER REGISTERED
// onEvent(DomainEvent.USER_REGISTERED, async (payload) => {
//   await NotificationService.send({
//     to: payload.email,
//     channel: NotificationChannel.EMAIL,
//     template: EmailTemplate.WELCOME,
//     subject: "Welcome to Instalflow 🎉",
//     context: {
//       name: payload.name,
//       dashboard_url: process.env.FRONTEND_URL,
//     },
//   });
// });

// // MARKETER CREATED
// onEvent(DomainEvent.MARKETER_CREATED, async (payload) => {
//   await NotificationService.send({
//     to: payload.email,
//     channel: NotificationChannel.EMAIL,
//     template: EmailTemplate.MARKETER_WELCOME,
//     subject: "Your Marketer Account",
//     context: payload,
//   });
// });

// // PASSWORD RESET
// onEvent(DomainEvent.PASSWORD_RESET_REQUESTED, async (payload) => {
//   await NotificationService.send({
//     to: payload.email,
//     channel: NotificationChannel.EMAIL,
//     template: EmailTemplate.FORGOT_PASSWORD_OTP,
//     subject: "Password Reset OTP",
//     context: payload,
//   });
// });
