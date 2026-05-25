export enum NotificationEventType {
  KYC_APPLICATION_SUBMITTED = "KYC_APPLICATION_SUBMITTED",
  INSTALLMENT_OVERDUE = "INSTALLMENT_OVERDUE",
  PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED",
  COMMISSION_ACCRUED = "COMMISSION_ACCRUED",
  COMMISSION_TRANSFER_REQUEST = "COMMISSION_TRANSFER_REQUEST",
  INSTALLMENT_REMINDER_3DAY = "INSTALLMENT_REMINDER_3DAY",
  INSTALLMENT_DUE_TODAY = "INSTALLMENT_DUE_TODAY",
  INSTALLMENT_OVERDUE_3DAY = "INSTALLMENT_OVERDUE_3DAY",
  INSTALLMENT_OVERDUE_7DAY = "INSTALLMENT_OVERDUE_7DAY",
}

export interface NotificationPayloadMap {
  [NotificationEventType.KYC_APPLICATION_SUBMITTED]: {
    applicationId: string;
    customerName: string;
    customerEmail: string;
    customer: { userId: string; referredByMarketerId?: string };
  };
  [NotificationEventType.INSTALLMENT_OVERDUE]: {
    installmentId: string;
    userId: string;
    customerName: string;
  };
  [NotificationEventType.PAYMENT_CONFIRMED]: {
    paymentId: string;
    userId: string;
    amount: number;
  };
  [NotificationEventType.COMMISSION_ACCRUED]: {
    commissionId: string;
    marketerId: string;
    marketerEmail: string;
    marketerName: string;
    amount: number;
  };
  [NotificationEventType.COMMISSION_TRANSFER_REQUEST]: {
    requestId: string;
    marketerName: string;
    amount: string;
  };
  [NotificationEventType.INSTALLMENT_REMINDER_3DAY]: {
    customerId: string;
    customerEmail: string;
    customerName: string;
    installmentId: string;
    sequence: number;
    dueDate: string;
    amount: string;
    productName: string;
    variantName?: string;
    percentagePaid: number;
    payment_url?: string;
    dashboard_url?: string;
  };
  [NotificationEventType.INSTALLMENT_DUE_TODAY]: {
    customerId: string;
    customerEmail: string;
    customerName: string;
    installmentId: string;
    sequence: number;
    dueDate: string;
    amount: string;
    productName: string;
    variantName?: string;
    percentagePaid: number;
    payment_url?: string;
    dashboard_url?: string;
  };
  [NotificationEventType.INSTALLMENT_OVERDUE_3DAY]: {
    customerId: string;
    customerEmail: string;
    customerName: string;
    installmentId: string;
    sequence: number;
    dueDate: string;
    amount: string;
    productName: string;
    variantName?: string;
    percentagePaid: number;
    marketerId: string;
    marketerEmail: string;
    marketerName: string;
    payment_url?: string;
  };
  [NotificationEventType.INSTALLMENT_OVERDUE_7DAY]: {
    customerId: string;
    customerEmail: string;
    customerName: string;
    installmentId: string;
    sequence: number;
    dueDate: string;
    expectedPaymentDate: string;
    amount: string;
    productName: string;
    variantName?: string;
    percentagePaid: number;
    marketerId: string;
    marketerEmail: string;
    marketerName: string;
    adminId: string;
    adminEmail: string;
    adminName: string;
    payment_url?: string;
    dashboard_url?: string;
  };
}
