import { z } from "zod";

export const RestructureContractSchema = z.object({
  interestPercentage: z
    .number()
    .min(0, "Interest percentage must be non-negative")
    .max(100, "Interest percentage cannot exceed 100"),
  numberOfInstallments: z
    .number()
    .int("Number of installments must be an integer")
    .min(1, "At least 1 installment is required")
    .max(120, "Maximum 120 installments allowed"),
  firstPaymentDate: z.coerce.date(),
});

export const WriteOffContractSchema = z.object({
  reason: z
    .string()
    .min(4, "Write-off reason must be at least 4 characters")
    .max(500, "Write-off reason is too long"),
});
