import { z } from "zod";

export const RequestPayoutSchema = z.object({
  amount: z.number().positive("Payout amount must be greater than 0"),
});

export const ApprovePayoutSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const GetCommissionsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20)),
});
