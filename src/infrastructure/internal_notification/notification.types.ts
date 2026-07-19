export enum NotificationEventType {
  KYC_APPLICATION_SUBMITTED = "KYC_APPLICATION_SUBMITTED",
  INSTALLMENT_OVERDUE = "INSTALLMENT_OVERDUE",
  PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED",
  COMMISSION_ACCRUED = "COMMISSION_ACCRUED",
  COMMISSION_TRANSFER_REQUEST = "COMMISSION_TRANSFER_REQUEST",
  COMMISSION_REQUEST_APPROVAL = "COMMISSION_REQUEST_APPROVAL",
  INSTALLMENT_REMINDER_3DAY = "INSTALLMENT_REMINDER_3DAY",
  INSTALLMENT_DUE_TODAY = "INSTALLMENT_DUE_TODAY",
  INSTALLMENT_OVERDUE_3DAY = "INSTALLMENT_OVERDUE_3DAY",
  INSTALLMENT_OVERDUE_7DAY = "INSTALLMENT_OVERDUE_7DAY",
  COMMISSION_TRANSFER_INITIATED = "COMMISSION_TRANSFER_INITIATED",
  COMMISSION_TRANSFER_SUCCESS = "COMMISSION_TRANSFER_SUCCESS",
  COMMISSION_TRANSFER_FAILED = "COMMISSION_TRANSFER_FAILED",
  COMMISSION_TRANSFER_REVERSED = "COMMISSION_TRANSFER_REVERSED",
  MARKETER_TOGGLE_REQUEST = "MARKETER_TOGGLE_REQUEST",
  MARKETER_DELETE_REQUEST = "MARKETER_DELETE_REQUEST",
  MARKETER_TOGGLE_APPROVED = "MARKETER_TOGGLE_APPROVED",
  MARKETER_TOGGLE_REJECTED = "MARKETER_TOGGLE_REJECTED",
  MARKETER_DELETE_APPROVED = "MARKETER_DELETE_APPROVED",
  MARKETER_DELETE_REJECTED = "MARKETER_DELETE_REJECTED",
  CONTRACT_RESTRUCTURED = "CONTRACT_RESTRUCTURED",
  CONTRACT_WRITTEN_OFF = "CONTRACT_WRITTEN_OFF",
}

export interface NotificationPayloadMap {
  [NotificationEventType.KYC_APPLICATION_SUBMITTED]: {
    applicationId: string;
    customerName: string;
    customerEmail: string;
    customer: { email: string; referredByMarketerId?: string };
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
  [NotificationEventType.COMMISSION_REQUEST_APPROVAL]: {
    requestId: string;
    marketerId: string;
    marketerName: string;
    role: "ADMIN" | "COMPANY";
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

  [NotificationEventType.COMMISSION_TRANSFER_INITIATED]: {
    payoutId: string;
    marketerId: string;
    marketerName: string;
    amount: number;
    bankName: string;
    maskedAccount: string;
  };

  [NotificationEventType.COMMISSION_TRANSFER_SUCCESS]: {
    payoutId: string;
    marketerId: string;
    marketerName: string;
    amount: number;
    transferCode: string;
    bankName: string;
    maskedAccount: string;
    companyId: string;
  };

  [NotificationEventType.COMMISSION_TRANSFER_FAILED]: {
    payoutId: string;
    marketerId: string;
    marketerName: string;
    amount: number;
    reason: string;
    companyId: string;
  };

  [NotificationEventType.COMMISSION_TRANSFER_REVERSED]: {
    payoutId: string;
    marketerId: string;
    marketerName: string;
    amount: number;
    companyId: string;
  };
  [NotificationEventType.MARKETER_TOGGLE_REQUEST]: {
    requestId: string;
    companyId: string;
    marketerId: string;
    marketerName: string;
    requestedBy: string;
    reason?: string;
  };

  [NotificationEventType.MARKETER_DELETE_REQUEST]: {
    requestId: string;
    companyId: string;
    marketerId: string;
    marketerName: string;
    requestedBy: string;
    reason?: string;
  };

  [NotificationEventType.MARKETER_TOGGLE_APPROVED]: {
    requestId: string;
    marketerId: string;
    marketerName: string;
  };

  [NotificationEventType.MARKETER_TOGGLE_REJECTED]: {
    requestId: string;
    marketerId: string;
    marketerName: string;
    reviewReason?: string;
  };

  [NotificationEventType.MARKETER_DELETE_APPROVED]: {
    requestId: string;
    marketerId: string;
    marketerName: string;
  };

  [NotificationEventType.MARKETER_DELETE_REJECTED]: {
    requestId: string;
    marketerId: string;
    marketerName: string;
    reviewReason?: string;
  };
  [NotificationEventType.CONTRACT_RESTRUCTURED]: {
    contractId: string;
    customerName: string;
    customerEmail: string;
    newTotalFinanced: number;
    restructuredBy: string;
    restructuredAt: string;
    marketerId: string;
    marketerEmail: string;
    marketerName: string;
  };
  [NotificationEventType.CONTRACT_WRITTEN_OFF]: {
    contractId: string;
    customerName: string;
    customerEmail: string;
    outstandingAmount: number;
    writeOffReason: string;
    writtenOffBy: string;
    writtenOffAt: string;
    recipientRole: "MARKETER" | "ADMIN" | "COMPANY";
    recipientId: string;
    recipientName: string;
    recipientEmail: string;
    companyId: string;
  };
}
