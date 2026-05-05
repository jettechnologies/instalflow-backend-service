import { z } from "zod";

export const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address",
  }),
  password: z.string().min(6, "Password must be at least 6 characters"),
  referredByMarketerId: z.uuid().optional(),
});

export const LoginSchema = z.object({
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address",
  }),
  password: z.string().min(1, "Password is required"),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address",
  }),
});

export const ResetPasswordSchema = z.object({
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address",
  }),
  token: z.string().length(6, "OTP must be 6 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

/**
 * For Companies registering themselves (e.g. after payment)
 */
export const CompanyRegisterSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  adminName: z.string().min(2, "Admin name is required"),
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address",
  }),
  password: z.string().min(6, "Password must be at least 6 characters"),
  planId: z.string().uuid("Invalid plan ID"),
});

/**
 * For Companies creating their Marketers
 */
export const MarketerCreateSchema = z.object({
  name: z.string().min(2, "Marketer name is required"),
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address",
  }),
});
