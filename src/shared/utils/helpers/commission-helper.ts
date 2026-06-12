import {
  Prisma,
  CommissionStatus,
  CommissionAllocationStatus,
} from "@/infrastructure/prisma";

export function deriveReservationStatus(
  reservedAmount: Prisma.Decimal,
  totalAmount: Prisma.Decimal,
): CommissionStatus {
  if (reservedAmount.isZero()) return CommissionStatus.ACTIVE;
  if (reservedAmount.lessThan(totalAmount))
    return CommissionStatus.PARTIALLY_RESERVED;
  return CommissionStatus.RESERVED;
}

export function derivePostPaymentStatus(
  totalAmount: Prisma.Decimal,
  reservedAmount: Prisma.Decimal,
  totalPaid: Prisma.Decimal,
): CommissionStatus {
  if (totalPaid.greaterThanOrEqualTo(totalAmount)) return CommissionStatus.PAID;
  if (reservedAmount.isZero()) return CommissionStatus.ACTIVE;
  if (reservedAmount.lessThan(totalAmount.minus(totalPaid)))
    return CommissionStatus.PARTIALLY_RESERVED;
  return CommissionStatus.RESERVED;
}
