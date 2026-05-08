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
