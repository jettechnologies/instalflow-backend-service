import { ApprovalStatus } from "@/prisma/client";
import { z } from "zod";

export const CustomerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type CustomerQueryInput = z.infer<typeof CustomerQuerySchema>;

export const CreateApprovalRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason cannot exceed 500 characters"),
});

export type CreateApprovalRequestInput = z.infer<
  typeof CreateApprovalRequestSchema
>;
