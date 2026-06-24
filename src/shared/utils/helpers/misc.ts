import crypto from "crypto";
import { number } from "zod";

export const formatCurrency = (
  value: number,
  currency = "NGN",
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  },
) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    ...options,
  }).format(value);

export const MetadataType = {
  onboarding_payment: "onboarding_payment",
  installment_payment: "installment_payment",
  company_subscription: "company_subscription",
} as const;

export function maskAccountNumber(
  accountNumber: string,
  visibleDigits = 4,
): string {
  const digits = accountNumber.replace(/\D/g, "");

  if (!digits) return "";

  const visible = digits.slice(-visibleDigits);
  const masked = "*".repeat(Math.max(digits.length - visible.length, 0));

  return `${masked}${visible}`;
}

export const generateTempPassword = (type: "MRK" | "ADM"): string => {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%^&*";

  const random = (chars: string) =>
    chars[Math.floor(Math.random() * chars.length)];

  const password = [
    random(lowercase),
    random(uppercase),
    random(numbers),
    random(special),
    ...crypto
      .randomBytes(6)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6),
  ];

  const suffix = password.sort(() => Math.random() - 0.5).join("");

  return `IFL_${type}_${suffix}`;
};
