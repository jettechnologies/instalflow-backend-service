import { z } from "zod";

export const GenerateReferralLinkSchema = z.object({
  productSlug: z.string().min(1, "Product slug is required"),
  variantId: z.string().uuid().optional(),
});

export const InviteRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  referredByCode: z.string().min(1, "Marketer referral code is required"),
});

export const SubmitApplicationSchema = z.object({
  productId: z.string().uuid("Product ID must be a valid UUID"),
  variantId: z.string().uuid("Variant ID must be a valid UUID"),
  installmentPlanId: z.string().uuid("Installment Plan ID must be a valid UUID"),
  idType: z.enum(["NIN", "BVN", "PASSPORT"], {
    message: "KYC ID Type must be NIN, BVN, or PASSPORT",
  }),
  idNumber: z
    .string()
    .min(5, "ID Number must be at least 5 characters")
    .max(30, "ID Number is too long"),
});

export const RejectApplicationSchema = z.object({
  reason: z.string().min(4, "Rejection reason must be at least 4 characters"),
});
