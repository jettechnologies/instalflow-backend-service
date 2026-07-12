import crypto from "crypto";
import { logger } from "@/infrastructure/logger/logger";

const BASE_URL = "https://api.paystack.co";
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

export enum PaystackErrorCode {
  TIMEOUT = "PAYSTACK_TIMEOUT",
  NETWORK_ERROR = "PAYSTACK_NETWORK_ERROR",
  INVALID_RESPONSE = "PAYSTACK_INVALID_RESPONSE",
  AUTH_FAILED = "PAYSTACK_AUTH_FAILED",
  INSUFFICIENT_FUNDS = "PAYSTACK_INSUFFICIENT_FUNDS",
  TRANSFER_FAILED = "PAYSTACK_TRANSFER_FAILED",
  ACCOUNT_RESOLUTION_FAILED = "PAYSTACK_ACCOUNT_RESOLUTION_FAILED",
  REQUEST_FAILED = "PAYSTACK_REQUEST_FAILED",
}

export interface PaystackError extends Error {
  code: PaystackErrorCode;
  retryable: boolean;
  status?: number;
  data?: any;
}

export interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

export interface RequestContext {
  traceId: string;
  paymentIntentId?: string;
  idempotencyKey?: string;
}

export class PaystackHttpClient {
  private static circuit: CircuitState = {
    failures: 0,
    lastFailure: 0,
    open: false,
  };
  private static readonly CIRCUIT_THRESHOLD = 5;
  private static readonly CIRCUIT_TIMEOUT_MS = 60000;
  private static readonly DEFAULT_TIMEOUT_MS = 10000;
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 500;

  private static generateTraceId(): string {
    return `pt_${crypto.randomBytes(16).toString("hex")}`;
  }

  private static isCircuitOpen(): boolean {
    if (!this.circuit.open) return false;
    const now = Date.now();
    if (now - this.circuit.lastFailure > this.CIRCUIT_TIMEOUT_MS) {
      this.circuit.open = false;
      this.circuit.failures = 0;
      return false;
    }
    return true;
  }

  private static recordFailure(): void {
    this.circuit.failures++;
    this.circuit.lastFailure = Date.now();
    if (this.circuit.failures >= this.CIRCUIT_THRESHOLD) {
      this.circuit.open = true;
      logger.warn("Paystack circuit breaker OPENED", {
        failureCount: this.circuit.failures,
        timeoutMs: this.CIRCUIT_TIMEOUT_MS,
      });
    }
  }

  private static recordSuccess(): void {
    this.circuit.failures = 0;
    this.circuit.open = false;
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static calculateBackoff(attempt: number): number {
    const exponential = this.BASE_DELAY_MS * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponential;
    return Math.min(exponential + jitter, 10000);
  }

  private static buildHeaders(context: RequestContext): Record<string, string> {
    return {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "application/json",
      "X-Request-Id": context.traceId,
      ...(context.idempotencyKey && {
        "Idempotency-Key": context.idempotencyKey,
      }),
    };
  }

  private static createError(
    code: PaystackErrorCode,
    message: string,
    retryable: boolean,
    status?: number,
    data?: any,
  ): PaystackError {
    const error = new Error(message) as PaystackError;
    error.code = code;
    error.retryable = retryable;
    error.status = status;
    error.data = data;
    return error;
  }

  static async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      params?: Record<string, string>;
      body?: unknown;
      timeoutMs?: number;
      context?: RequestContext;
      skipCircuitCheck?: boolean;
    } = {},
  ): Promise<T> {
    const {
      method = "GET",
      params,
      body,
      timeoutMs = this.DEFAULT_TIMEOUT_MS,
      context,
      skipCircuitCheck = false,
    } = options;

    const traceId = context?.traceId ?? this.generateTraceId();
    const requestContext: RequestContext = {
      traceId,
      paymentIntentId: context?.paymentIntentId,
      idempotencyKey: context?.idempotencyKey,
    };

    if (!skipCircuitCheck && this.isCircuitOpen()) {
      logger.warn("Paystack request blocked by circuit breaker", { traceId });
      throw this.createError(
        PaystackErrorCode.REQUEST_FAILED,
        "Paystack temporarily unavailable (circuit open)",
        false,
        503,
      );
    }

    const url = params
      ? `${BASE_URL}${endpoint}?${new URLSearchParams(params).toString()}`
      : `${BASE_URL}${endpoint}`;

    let lastError: PaystackError | undefined;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        logger.info("Paystack request initiated", {
          traceId,
          endpoint,
          method,
          attempt,
          paymentIntentId: requestContext.paymentIntentId,
        });

        const response = await fetch(url, {
          method,
          headers: this.buildHeaders(requestContext),
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        let data: any;
        try {
          data = await response.json();
        } catch (parseError) {
          throw this.createError(
            PaystackErrorCode.INVALID_RESPONSE,
            "Failed to parse Paystack response",
            false,
            response.status,
          );
        }

        if (!response.ok || !data.status) {
          const isRetryable = this.isRetryableStatus(response.status);
          throw this.createError(
            this.mapErrorCode(data?.message, endpoint),
            data?.message ||
              `Paystack request failed with status ${response.status}`,
            isRetryable,
            response.status,
            data,
          );
        }

        this.recordSuccess();

        logger.info("Paystack request successful", {
          traceId,
          endpoint,
          attempt,
          status: response.status,
        });

        return data.data as T;
      } catch (error) {
        clearTimeout(timeout);
        lastError =
          error instanceof Error && "code" in error
            ? (error as PaystackError)
            : this.createError(
                this.isAbortError(error)
                  ? PaystackErrorCode.TIMEOUT
                  : PaystackErrorCode.NETWORK_ERROR,
                error instanceof Error ? error.message : String(error),
                true,
              );

        if (lastError.code === PaystackErrorCode.TIMEOUT) {
          this.recordFailure();
        }

        if (!lastError.retryable || attempt === this.MAX_RETRIES) {
          break;
        }

        const backoff = this.calculateBackoff(attempt);
        logger.warn("Paystack request retry", {
          traceId,
          endpoint,
          attempt,
          nextAttempt: attempt + 1,
          backoffMs: backoff,
          error: lastError.message,
        });

        await this.delay(backoff);
      }
    }

    throw lastError!;
  }

  static async initializeTransaction(params: {
    email: string;
    amountKobo: number;
    metadata?: Record<string, unknown>;
    callbackUrl?: string;
    context?: RequestContext;
  }): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }> {
    const { email, amountKobo, metadata, callbackUrl, context } = params;

    const idempotencyKey =
      context?.idempotencyKey ?? `init_${crypto.randomUUID()}`;
    const traceId = context?.traceId ?? this.generateTraceId();

    return this.request("/transaction/initialize", {
      method: "POST",
      body: {
        email,
        amount: amountKobo,
        metadata: metadata ?? {},
        ...(callbackUrl && { callback_url: callbackUrl }),
      },
      context: {
        traceId,
        idempotencyKey,
        paymentIntentId: context?.paymentIntentId,
      },
    });
  }

  static async verifyTransaction(
    reference: string,
    context?: RequestContext,
  ): Promise<{
    status: string;
    amount: number;
    reference: string;
    metadata?: Record<string, unknown>;
  }> {
    const traceId = context?.traceId ?? this.generateTraceId();
    return this.request(`/transaction/verify/${reference}`, {
      method: "GET",
      context: {
        traceId,
        paymentIntentId: context?.paymentIntentId,
        idempotencyKey: context?.idempotencyKey,
      },
    });
  }

  static async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency?: string;
    context?: RequestContext;
  }): Promise<{ recipientCode: string }> {
    const { name, accountNumber, bankCode, currency = "NGN", context } = params;
    const traceId = context?.traceId ?? this.generateTraceId();

    return this.request("/transferrecipient", {
      method: "POST",
      body: {
        type: "nuban",
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency,
      },
      context: {
        traceId,
        paymentIntentId: context?.paymentIntentId,
        idempotencyKey: context?.idempotencyKey,
      },
    });
  }

  static async initiateTransfer(params: {
    amountKobo: number;
    recipientCode: string;
    reference: string;
    reason?: string;
    context?: RequestContext;
  }): Promise<{
    transferCode: string;
    status: string;
  }> {
    const { amountKobo, recipientCode, reference, reason, context } = params;
    const traceId = context?.traceId ?? this.generateTraceId();

    return this.request("/transfer", {
      method: "POST",
      body: {
        source: "balance",
        amount: amountKobo,
        recipient: recipientCode,
        reason: reason ?? "Commission payout",
        reference,
      },
      context: {
        traceId,
        paymentIntentId: context?.paymentIntentId,
        idempotencyKey: context?.idempotencyKey,
      },
    });
  }

  static async resolveAccount(params: {
    accountNumber: string;
    bankCode: string;
    context?: RequestContext;
  }): Promise<{ accountName: string }> {
    const { accountNumber, bankCode, context } = params;
    const traceId = context?.traceId ?? this.generateTraceId();

    return this.request("/bank/resolve", {
      method: "GET",
      params: { account_number: accountNumber, bank_code: bankCode },
      context: {
        traceId,
        paymentIntentId: context?.paymentIntentId,
        idempotencyKey: context?.idempotencyKey,
      },
    });
  }

  private static isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  private static isRetryableStatus(status?: number): boolean {
    if (!status) return true;
    return status === 429 || status >= 500 || status === 408;
  }

  private static mapErrorCode(
    message?: string,
    endpoint?: string,
  ): PaystackErrorCode {
    if (!message) return PaystackErrorCode.REQUEST_FAILED;
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("timeout")) return PaystackErrorCode.TIMEOUT;
    if (lowerMessage.includes("insufficient"))
      return PaystackErrorCode.INSUFFICIENT_FUNDS;
    if (endpoint?.includes("transfer"))
      return PaystackErrorCode.TRANSFER_FAILED;
    if (endpoint?.includes("resolve"))
      return PaystackErrorCode.ACCOUNT_RESOLUTION_FAILED;
    return PaystackErrorCode.REQUEST_FAILED;
  }

  static verifyWebhookSignature(
    payload: string,
    signature: string,
  ): { valid: boolean; traceId: string } {
    const traceId = `wh_${crypto.randomBytes(12).toString("hex")}`;
    try {
      const expectedSignature = crypto
        .createHmac("sha512", SECRET_KEY!)
        .update(payload)
        .digest("hex");

      const valid = this.timingSafeCompare(expectedSignature, signature);

      if (!valid) {
        logger.warn("Webhook signature verification failed", {
          traceId,
          reason: "signature_mismatch",
        });
      }

      return { valid, traceId };
    } catch (error) {
      logger.error("Webhook signature verification error", {
        traceId,
        error,
      });
      return { valid: false, traceId };
    }
  }

  private static timingSafeCompare(a: string, b: string): boolean {
    try {
      const aBuffer = Buffer.from(a);
      const bBuffer = Buffer.from(b);

      if (aBuffer.length !== bBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(aBuffer, bBuffer);
    } catch {
      return false;
    }
  }
}
