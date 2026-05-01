import { z } from "zod";
import { SubscriptionInterval } from "../../prisma/client.js";

export const CreateSubscriptionPlanSchema = z.object({
  name: z.string().min(2, "Plan name must be at least 2 characters"),
  description: z.string().optional(),
  price: z.number().min(0, "Price cannot be negative"),
  discountPrice: z.number().min(0).optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
  interval: z.enum(SubscriptionInterval).default(SubscriptionInterval.MONTHLY),
  active: z.boolean().default(true).optional(),
});

export const UpdateSubscriptionPlanSchema =
  CreateSubscriptionPlanSchema.partial();

export const InitializeSubscriptionSchema = z.object({
  planId: z.uuid("Invalid plan ID"),
});
