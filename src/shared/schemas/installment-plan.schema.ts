import { z } from "zod";

export const UpdateInstallmentPlanSchema = z.object({
  durationMonths: z.number().int().positive().optional(),
  interestPercentage: z.number().min(0).optional(),
  active: z.boolean().optional(),
});

export const DeactivateInstallmentPlanSchema = z.object({
  active: z.boolean(),
});

export const CreateInstallmentPlanSchema = z.object({
  productId: z.string().uuid(),
  durationMonths: z.number().int().positive(),
  interestPercentage: z.number().min(0).default(0),
  active: z.boolean().default(true),
});