import { z } from "zod";
import { ApprovalStatus } from "@/infrastructure/prisma";

export const CreateAdminSchema = z.object({
  name: z.string().min(2, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
});

export const ToggleStatusSchema = z.object({
  active: z.boolean(),
});

export const HandleApprovalSchema = z.object({
  status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
});

