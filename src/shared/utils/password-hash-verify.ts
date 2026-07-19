import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET!;

// Hash password
// export async function bcryptHash(password: string): Promise<string> {
//   return bcrypt.hash(password, 10);
// }

// // Compare password
// export async function bcryptCompare(
//   password: string,
//   hash: string
// ): Promise<boolean> {
//   return bcrypt.compare(password, hash);
// }

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "12", 10);

// Hash password
export async function bcryptHash(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

// Compare password
export async function bcryptCompare(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

interface AccessTokenParams {
  companyId?: string;
  userId: string;
  role: string;
  email: string;
  sessionId: string;
}

// Generate Access Token
export function generateAccessToken({
  userId,
  companyId,
  role,
  email,
  sessionId,
}: AccessTokenParams) {
  return jwt.sign(
    { userId, companyId, role, email, sessionId },
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: "1d",
    },
  );
}

// Generate a short-lived login/activation token for a newly-created customer
// (e.g. delivered on KYC approval completion so they can sign in for the first time).
export function generateLoginToken(userId: string, email?: string): string {
  return jwt.sign(
    { userId, role: "CUSTOMER", email, sessionId: userId },
    ACCESS_TOKEN_SECRET,
    { expiresIn: "1d" },
  );
}

// Generate Refresh Token
export function generateRefreshToken({
  companyId,
  userId,
  role,
  email,
}: Omit<AccessTokenParams, "sessionId">) {
  return jwt.sign({ companyId, userId, role, email }, REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
}

// Verify Refresh Token
export function verifyRefreshToken(token: string) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET) as Omit<
    AccessTokenParams,
    "sessionId"
  >;
}

//  verify access token
export function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET) as AccessTokenParams;
}

const KYC_ONBOARDING_SECRET = process.env.KYC_ONBOARDING_SECRET!;

interface OnboardingTokenPayload {
  sessionId: string;
  purpose: "KYC_ONBOARDING";
}

export function generateOnboardingToken(sessionId: string): string {
  return jwt.sign(
    { sessionId, purpose: "KYC_ONBOARDING" } as OnboardingTokenPayload,
    KYC_ONBOARDING_SECRET,
    { expiresIn: "24h" },
  );
}

export function verifyOnboardingToken(token: string): OnboardingTokenPayload {
  const decoded = jwt.verify(
    token,
    KYC_ONBOARDING_SECRET,
  ) as OnboardingTokenPayload;

  if (decoded.purpose !== "KYC_ONBOARDING") {
    throw new Error("Invalid token purpose.");
  }

  return decoded;
}
