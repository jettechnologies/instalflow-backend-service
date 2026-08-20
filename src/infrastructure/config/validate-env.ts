const REQUIRED_SECRETS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SESSION_SECRET",
  "CSRF_SECRET",
  "PAYSTACK_SECRET_KEY",
] as const;

export function validateSecrets(): void {
  const missing = REQUIRED_SECRETS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

validateSecrets();
