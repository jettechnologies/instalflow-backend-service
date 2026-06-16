// csrf.utils.ts
import crypto from "crypto";

const SECRET = process.env.CSRF_SECRET || "must-set-csrf-secret-in-env";

export const createCsrfToken = (): string =>
  crypto.randomBytes(32).toString("hex");

export const hashToken = (token: string): string =>
  crypto.createHmac("sha256", SECRET).update(token).digest("hex");

export const safeCompare = (a: string, b: string): boolean => {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");

    if (aBuf.length !== bBuf.length) return false;

    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
};
