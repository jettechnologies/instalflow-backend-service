import { z } from "zod";

export const PasswordSchema = z
  .string({
    message: "Password is required",
  })
  .min(8, "Password must be at least 8 characters long")
  .max(30, "Password cannot exceed 30 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/']/,
    "Password must contain at least one special character",
  )
  .regex(/^\S+$/, "Password cannot contain spaces");

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
  password: PasswordSchema,
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
  newPassword: PasswordSchema,
});

export const ChangePasswordSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
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
  password: PasswordSchema,
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

export const ForcePasswordChangeSchema = z
  .object({
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
