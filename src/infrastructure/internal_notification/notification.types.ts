export enum NotificationEventType {
  KYC_APPLICATION_SUBMITTED = "KYC_APPLICATION_SUBMITTED",
  INSTALLMENT_OVERDUE = "INSTALLMENT_OVERDUE",
  PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED",
  COMMISSION_ACCRUED = "COMMISSION_ACCRUED",
  COMMISSION_TRANSFER_REQUEST = "COMMISSION_TRANSFER_REQUEST",
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
    amount: number;
  };
  [NotificationEventType.COMMISSION_TRANSFER_REQUEST]: {
    requestId: string;
    marketerName: string;
  };
}
