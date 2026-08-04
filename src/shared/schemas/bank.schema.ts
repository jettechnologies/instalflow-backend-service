import { z } from "zod";

export const AddBankAccountSchema = z.object({
  bankName: z.string().min(1),
  bankCode: z.string().min(3).max(10),
  accountNumber: z.string().length(10),
  isPrimary: z.boolean().optional().default(false),
});

export const SwitchPrimaryBankAccountSchema = z.object({
  accountId: z.string(),
});

export const RemoveBankAccountSchema = z.object({
  accountId: z.string(),
});
