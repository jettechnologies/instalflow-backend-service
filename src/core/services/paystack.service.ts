import {
  PaystackHttpClient,
  PaystackErrorCode,
} from "@/infrastructure/paystack/PaystackHttpClient";

export { PaystackErrorCode };
export { PaystackHttpClient };

export class PaystackService {
  static async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency?: string;
  }): Promise<{ recipientCode: string }> {
    return PaystackHttpClient.createTransferRecipient({
      name: params.name,
      accountNumber: params.accountNumber,
      bankCode: params.bankCode,
      currency: params.currency,
    });
  }

  static async initiateTransfer(params: {
    amountKobo: number;
    recipientCode: string;
    reference: string;
    reason?: string;
  }): Promise<{ transferCode: string; status: string }> {
    return PaystackHttpClient.initiateTransfer({
      amountKobo: params.amountKobo,
      recipientCode: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    });
  }

  static async resolveAccount(params: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountName: string }> {
    return PaystackHttpClient.resolveAccount({
      accountNumber: params.accountNumber,
      bankCode: params.bankCode,
    });
  }

  static verifyWebhookSignature(payload: string, signature: string): boolean {
    const { valid } = PaystackHttpClient.verifyWebhookSignature(
      payload,
      signature,
    );
    return valid;
  }

  static async initializeTransaction(params: {
    email: string;
    amountKobo: number;
    metadata?: Record<string, unknown>;
  }): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }> {
    const result = await PaystackHttpClient.initializeTransaction({
      email: params.email,
      amountKobo: params.amountKobo,
      metadata: params.metadata,
    });

    return {
      authorization_url: result.authorization_url,
      access_code: result.access_code,
      reference: result.reference,
    };
  }

  static async verifyTransaction(reference: string): Promise<{
    status: string;
    amount: number;
    metadata?: Record<string, unknown>;
  }> {
    return PaystackHttpClient.verifyTransaction(reference);
  }
}
