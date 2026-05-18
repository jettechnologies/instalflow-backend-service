// src/events/event.types.ts

export enum DomainEvent {
  // Auth / Identity
  USER_REGISTERED = "user.registered",
  STAFF_CREATED = "staff.created",
  OTP_REQUESTED = "auth.otp.requested",
  PASSWORD_RESET_REQUESTED = "auth.password.reset.requested",
  PASSWORD_RESET_COMPLETED = "auth.password.reset.completed",

  // Orders
  ORDER_CREATED = "order.created",
  ORDER_CANCELLED = "order.cancelled",
  ORDER_STATUS_UPDATED = "order.status.updated",

  // Company
  COMPANY_ONBOARDED = "company.onboarded",

  // Installments
  INSTALLMENT_PAID = "installment.paid",
}

export enum EventStatus {
  PENDING = "pending",
  PROCESSED = "processed",
  FAILED = "failed",
}

export interface DomainEventPayloads {
  [DomainEvent.USER_REGISTERED]: {
    email: string;
    name: string;
    dashboard_url?: string;
    role?: string;
    applicationUnderReview?: boolean;
    rejectionReason?: string;
  };
  [DomainEvent.STAFF_CREATED]: {
    email: string;
    name: string;
    role: string;
    tempPassword: string;
    dashboard_url?: string;
  };
  [DomainEvent.OTP_REQUESTED]: {
    email: string;
    otp: string;
  };
  [DomainEvent.PASSWORD_RESET_REQUESTED]: {
    email: string;
    name: string;
    otp: string;
  };
  [DomainEvent.PASSWORD_RESET_COMPLETED]: {
    email: string;
    name: string;
  };
  [DomainEvent.ORDER_CREATED]: {
    email: string;
    orderId: string;
    amount: number | string;
    date: string;
    dashboard_url?: string;
  };
  [DomainEvent.ORDER_CANCELLED]: {
    email: string;
    orderId: string;
  };
  [DomainEvent.ORDER_STATUS_UPDATED]: {
    email: string;
    orderId: string;
    newStatus: string;
  };
  [DomainEvent.COMPANY_ONBOARDED]: {
    email: string;
    adminName: string;
    companyName: string;
    dashboard_url?: string;
  };
  [DomainEvent.INSTALLMENT_PAID]: {
    email: string;
    customerName: string;
    productName: string;
    amountPaid: string | number;
    dueDate: string;
    percentagePaid: number;
    dashboard_url?: string;
  };
}
