import crypto from "crypto";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";

export class PaystackService {
  /**
   * Verify Paystack webhook signature
   */
  static verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(payload)
        .digest("hex");

      return this.timingSafeCompare(expectedSignature, signature);
    } catch (error) {
      console.error("Webhook verification error:", error);
      return false;
    }
  }

  static async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency?: string;
  }): Promise<{ recipientCode: string }> {
    const response = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name: params.name,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: params.currency ?? "NGN",
      }),
    });

    const data = await response.json();

    if (!data.status) {
      throw new Error(
        `Paystack createTransferRecipient failed: ${data.message}`,
      );
    }

    return { recipientCode: data.data.recipient_code as string };
  }

  // ─── Initiate Transfer ──────────────────────────────────────────────────────

  static async initiateTransfer(params: {
    amountKobo: number; // already multiplied by 100
    recipientCode: string;
    reference: string; // use payoutId
    reason?: string;
  }): Promise<{ transferCode: string; status: string }> {
    const response = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: params.amountKobo,
        recipient: params.recipientCode,
        reason: params.reason ?? "Commission payout",
        reference: params.reference,
      }),
    });

    const data = await response.json();

    if (!data.status) {
      throw new Error(`Paystack initiateTransfer failed: ${data.message}`);
    }

    return {
      transferCode: data.data.transfer_code as string,
      status: data.data.status as string,
    };
  }

  // ─── Resolve Account (for verification) ────────────────────────────────────

  static async resolveAccount(params: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountName: string }> {
    const qs = new URLSearchParams({
      account_number: params.accountNumber,
      bank_code: params.bankCode,
    });

    const response = await fetch(
      `https://api.paystack.co/bank/resolve?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const data = await response.json();

    if (!data.status) {
      throw new Error(`Paystack resolveAccount failed: ${data.message}`);
    }

    return { accountName: data.data.account_name as string };
  }

  /**
   * Timing-safe comparison
   */
  private static timingSafeCompare(a: string, b: string): boolean {
    try {
      const aBuffer = Buffer.from(a);
      const bBuffer = Buffer.from(b);

      if (aBuffer.length !== bBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(aBuffer, bBuffer);
    } catch (error) {
      console.error("Timing safe compare error:", error);
      return false;
    }
  }
}
