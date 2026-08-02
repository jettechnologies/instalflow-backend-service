export interface PaymentInitializationPayload {
  email: string;
  callbackUrl?: string;
  metadata: {
    installmentId?: string;
    financingContractId?: string;
    productId?: string;
    onboardingId?: string;
    companyId?: string;
    subscriptionId?: string;
    planId?: string;
    sequence?: number;
    [key: string]: unknown;
  };
}

export function assertValidInitializationPayload(
  value: unknown,
  context: string,
): asserts value is PaymentInitializationPayload {
  if (!value || typeof value !== "object") {
    throw new Error(
      `[${context}] initializationPayload is missing or not an object`,
    );
  }

  const payload = value as Record<string, unknown>;

  if (typeof payload.email !== "string" || payload.email.trim() === "") {
    throw new Error(
      `[${context}] initializationPayload.email must be a non-empty string`,
    );
  }

  if (
    payload.callbackUrl !== undefined &&
    typeof payload.callbackUrl !== "string"
  ) {
    throw new Error(
      `[${context}] initializationPayload.callbackUrl must be a string when present`,
    );
  }

  if (
    payload.metadata === undefined ||
    payload.metadata === null ||
    typeof payload.metadata !== "object"
  ) {
    throw new Error(
      `[${context}] initializationPayload.metadata must be an object`,
    );
  }
}
