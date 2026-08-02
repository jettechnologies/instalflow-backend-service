import { InstallmentStatus } from "@/infrastructure/prisma";

export const PAYMENT_WINDOW_DAYS = 3;

export enum InstallmentEligibilityState {
  AVAILABLE = "AVAILABLE",
  TOO_EARLY = "TOO_EARLY",
  WAITING_FOR_PREVIOUS = "WAITING_FOR_PREVIOUS",
  PAID = "PAID",
  CONTRACT_COMPLETED = "CONTRACT_COMPLETED",
}

export type PaymentStatusLabel = "Upcoming" | "Due Today" | "Overdue" | "Paid";

export interface EligibilityInstallmentInput {
  installmentId: string;
  sequence: number;
  status: InstallmentStatus;
  dueDate: Date;
}

export interface NextUnpaidMarker {
  installmentId: string;
  sequence: number;
  dueDate: Date;
}

export interface InstallmentEligibility {
  installmentId: string;
  canPay: boolean;
  state: InstallmentEligibilityState;
  reason: string | null;
  isNextInstallment: boolean;
  paymentWindowStarted: boolean;
  availableFrom: Date | null;
  daysUntilDue: number;
  daysOverdue: number;
  isOverdue: boolean;
  isDueToday: boolean;
  isUpcoming: boolean;
  paymentStatusLabel: PaymentStatusLabel;
}

export const EligibilityMessages = {
  waitingForPrevious: (previousSequence: number) =>
    `Please settle Installment ${previousSequence} first.`,
  tooEarly:
    "This installment will become available for payment 3 days before its due date.",
  contractCompleted:
    "All installments for this financing contract have already been paid.",
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffInCalendarDays(date: Date, reference: Date): number {
  return Math.round(
    (startOfDay(date).getTime() - startOfDay(reference).getTime()) / MS_PER_DAY,
  );
}

export function computeInstallmentEligibility(
  installment: EligibilityInstallmentInput,
  nextUnpaid: NextUnpaidMarker | null,
  referenceDate: Date = new Date(),
): InstallmentEligibility {
  const isPaid = installment.status === InstallmentStatus.PAID;
  const diffDays = diffInCalendarDays(installment.dueDate, referenceDate);
  const isOverdue = !isPaid && diffDays < 0;
  const isDueToday = diffDays === 0;
  const isUpcoming = diffDays > 0;
  const daysUntilDue = diffDays;
  const daysOverdue = isOverdue ? Math.abs(diffDays) : 0;

  const paymentStatusLabel: PaymentStatusLabel = isPaid
    ? "Paid"
    : isOverdue
      ? "Overdue"
      : isDueToday
        ? "Due Today"
        : "Upcoming";

  let canPay = false;
  let state: InstallmentEligibilityState;
  let reason: string | null = null;
  let isNextInstallment = false;
  let paymentWindowStarted = false;
  let availableFrom: Date | null = null;

  if (isPaid) {
    state = InstallmentEligibilityState.PAID;
  } else if (!nextUnpaid) {
    state = InstallmentEligibilityState.CONTRACT_COMPLETED;
    reason = EligibilityMessages.contractCompleted;
  } else if (installment.installmentId !== nextUnpaid.installmentId) {
    state = InstallmentEligibilityState.WAITING_FOR_PREVIOUS;
    reason = EligibilityMessages.waitingForPrevious(nextUnpaid.sequence);
  } else {
    isNextInstallment = true;
    paymentWindowStarted = diffDays <= PAYMENT_WINDOW_DAYS;

    const availableFromDate = startOfDay(installment.dueDate);
    availableFromDate.setDate(
      availableFromDate.getDate() - PAYMENT_WINDOW_DAYS,
    );
    availableFrom = availableFromDate;

    if (paymentWindowStarted) {
      canPay = true;
      state = InstallmentEligibilityState.AVAILABLE;
    } else {
      state = InstallmentEligibilityState.TOO_EARLY;
      reason = EligibilityMessages.tooEarly;
    }
  }

  return {
    installmentId: installment.installmentId,
    canPay,
    state,
    reason,
    isNextInstallment,
    paymentWindowStarted,
    availableFrom,
    daysUntilDue,
    daysOverdue,
    isOverdue,
    isDueToday,
    isUpcoming,
    paymentStatusLabel,
  };
}

export function computeContractInstallmentEligibility(
  installments: EligibilityInstallmentInput[],
  referenceDate: Date = new Date(),
): Map<string, InstallmentEligibility> {
  const result = new Map<string, InstallmentEligibility>();
  if (installments.length === 0) return result;

  const sorted = [...installments].sort((a, b) => a.sequence - b.sequence);
  const nextUnpaidRow =
    sorted.find((i) => i.status !== InstallmentStatus.PAID) ?? null;
  const marker: NextUnpaidMarker | null = nextUnpaidRow
    ? {
        installmentId: nextUnpaidRow.installmentId,
        sequence: nextUnpaidRow.sequence,
        dueDate: nextUnpaidRow.dueDate,
      }
    : null;

  for (const installment of sorted) {
    result.set(
      installment.installmentId,
      computeInstallmentEligibility(installment, marker, referenceDate),
    );
  }

  return result;
}

export function getNextPayableInstallment(
  installments: EligibilityInstallmentInput[],
  referenceDate: Date = new Date(),
): {
  installment: EligibilityInstallmentInput;
  eligibility: InstallmentEligibility;
} | null {
  const sorted = [...installments].sort((a, b) => a.sequence - b.sequence);
  const nextUnpaid = sorted.find((i) => i.status !== InstallmentStatus.PAID);
  if (!nextUnpaid) return null;

  const marker: NextUnpaidMarker = {
    installmentId: nextUnpaid.installmentId,
    sequence: nextUnpaid.sequence,
    dueDate: nextUnpaid.dueDate,
  };

  return {
    installment: nextUnpaid,
    eligibility: computeInstallmentEligibility(
      nextUnpaid,
      marker,
      referenceDate,
    ),
  };
}
