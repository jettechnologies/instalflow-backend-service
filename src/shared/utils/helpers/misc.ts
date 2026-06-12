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
