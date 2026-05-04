import { prisma } from "@/prisma/client.js";
import crypto from "crypto";
import { z } from "zod";
import {
  bcryptHash,
  bcryptCompare,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../libs/password-hash-verify";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from "../libs/AppError";
import {
  RegisterSchema,
  LoginSchema,
  ChangePasswordSchema,
  CompanyRegisterSchema,
  MarketerCreateSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../schema/auth.schema";
import { SubscriptionService } from "./subscription.service";
import { LedgerService } from "./ledger.service";
import { AccountType } from "../../prisma/client.js";
import { emitEvent } from "@/events/emitter";
import { DomainEvent } from "@/events/event.types";

export class AuthService {
  /**
   * Register a new customer account.
   */
  static async register(data: z.infer<typeof RegisterSchema>) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictError("Email is already in use");

    if (data.referredByMarketerId) {
      const marketer = await prisma.user.findUnique({
        where: { userId: data.referredByMarketerId, role: "MARKETER" },
      });
      if (!marketer)
        throw new BadRequestError("Invalid referral: Marketer not found.");
    }

    const hashedPassword = await bcryptHash(data.password);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: "CUSTOMER",
        referredByMarketerId: data.referredByMarketerId,
      },
      select: {
        userId: true,
        name: true,
        email: true,
        role: true,
        referredByMarketerId: true,
        createdAt: true,
      },
    });

    const refreshToken = generateRefreshToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
    });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await prisma.userSession.create({
      data: {
        user: { connect: { userId: user.userId } },
        tokenHash: refreshToken,
        expiresAt,
      },
    });

    const accessToken = generateAccessToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      sessionId: session.sessionId,
    });

    // ✅ Fires → notification-hub → email_queue → email-worker → Brevo (welcome)
    emitEvent(DomainEvent.USER_REGISTERED, {
      email: user.email,
      name: user.name,
      dashboard_url: process.env.FRONTEND_URL,
    });

    return {
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Pre-validate onboarding data and create a pending record.
   * This is called BEFORE the user pays.
   */
  static async validateOnboarding(data: z.infer<typeof CompanyRegisterSchema>) {
    // 1. Check if email exists in active users
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) throw new ConflictError("Admin email already in use");

    // 2. Check if company name is already taken
    const existingCompany = await prisma.company.findFirst({
      where: { name: data.companyName },
    });
    if (existingCompany) throw new ConflictError("Company name already taken");

    // 3. Check for existing pending onboarding with same email
    // If it exists, we'll update it instead of creating a new one to prevent spam
    const hashedPassword = await bcryptHash(data.password);

    return await prisma.pendingOnboarding.upsert({
      where: { email: data.email },
      update: {
        companyName: data.companyName,
        adminName: data.adminName,
        passwordHash: hashedPassword,
        planId: data.planId,
        paymentReference: data.paymentReference,
        status: "PENDING",
      },
      create: {
        email: data.email,
        companyName: data.companyName,
        adminName: data.adminName,
        passwordHash: hashedPassword,
        planId: data.planId,
        paymentReference: data.paymentReference,
        status: "PENDING",
      },
    });
  }

  /**
   * Onboard a brand new Company + Admin User
   */
  static async onboardCompany(
    data: z.infer<typeof CompanyRegisterSchema>,
    isInternal = false,
  ) {
    let hashedPassword = "";

    if (isInternal) {
      // Path B: Webhook Safety Net
      // We retrieve the pre-hashed password from the Pending record
      const pending = await prisma.pendingOnboarding.findUnique({
        where: { paymentReference: data.paymentReference },
      });

      if (!pending) {
        throw new NotFoundError("Pending onboarding record not found");
      }

      if (pending.status === "COMPLETED") {
        return { message: "Already onboarded" };
      }

      hashedPassword = pending.passwordHash;
    } else {
      // Path A: Frontend Redirect
      // 1. Validate payment first
      const transaction = await SubscriptionService.validatePaystackTransaction(
        data.paymentReference,
      );

      // 2. Ensure payment plan matches requested plan
      if (transaction.metadata.planId !== data.planId) {
        throw new BadRequestError("Payment plan mismatch");
      }

      const existing = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing) throw new ConflictError("Admin email already in use");

      hashedPassword = await bcryptHash(data.password);
    }

    return await prisma.$transaction(async (tx) => {
      // 3. Create Company
      const company = await tx.company.create({
        data: { name: data.companyName, plan: "Pending" }, // Actual plan set below
      });

      // 4. Create Admin User
      const user = await tx.user.create({
        data: {
          name: data.adminName,
          email: data.email,
          password: hashedPassword,
          role: "COMPANY",
          companyId: company.companyId,
        },
        select: {
          userId: true,
          name: true,
          email: true,
          role: true,
          companyId: true,
          createdAt: true,
        },
      });

      // 5. Activate Subscription
      const plan = await tx.subscriptionPlan.findUnique({
        where: { planId: data.planId },
      });
      if (!plan) throw new Error("Plan not found");

      const startDate = new Date();
      const endDate = new Date();
      if (plan.interval === "WEEKLY") endDate.setDate(endDate.getDate() + 7);
      else if (plan.interval === "MONTHLY")
        endDate.setMonth(endDate.getMonth() + 1);
      else if (plan.interval === "YEARLY")
        endDate.setFullYear(endDate.getFullYear() + 1);

      await tx.companySubscription.create({
        data: {
          companyId: company.companyId,
          planId: plan.planId,
          status: "ACTIVE",
          startDate,
          endDate,
        },
      });

      // 6. Update Company with correct plan name
      await tx.company.update({
        where: { companyId: company.companyId },
        data: { plan: plan.name },
      });

      // 7. Ledger Entry (Double Entry: Asset Debit, Revenue Credit)
      await LedgerService.recordTransaction(
        {
          reference: data.paymentReference,
          description: `Initial Subscription: ${plan.name} (Company: ${company.name})`,
          companyId: company.companyId,
          entries: [
            {
              accountName: "PAYSTACK_CLEARING",
              accountType: AccountType.ASSET,
              debit: plan.discountPrice || plan.price,
            },
            {
              accountName: "PLATFORM_REVENUE",
              accountType: AccountType.REVENUE,
              credit: plan.discountPrice || plan.price,
            },
          ],
        },
        tx
      );

      // 8. Mark Pending Onboarding as COMPLETED
      await tx.pendingOnboarding.updateMany({
        where: { paymentReference: data.paymentReference },
        data: { status: "COMPLETED" },
      });

      const refreshToken = generateRefreshToken({
        companyId: company.companyId,
        userId: user.userId,
        role: user.role,
        email: user.email,
      });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const session = await tx.userSession.create({
        data: {
          user: { connect: { userId: user.userId } },
          tokenHash: refreshToken,
          expiresAt,
        },
      });

      const accessToken = generateAccessToken({
        companyId: company.companyId,
        userId: user.userId,
        role: user.role,
        email: user.email,
        sessionId: session.sessionId,
      });

      // ✅ Fires → notification-hub → email_queue → email-worker → Brevo (company-onboarding)
      emitEvent(DomainEvent.COMPANY_ONBOARDED, {
        adminName: user.name,
        companyName: company.name,
        dashboard_url: process.env.FRONTEND_URL,
      });

      return {
        company,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          createdAt: user.createdAt,
        },
        accessToken,
        refreshToken,
      };
    });
  }

  /**
   * For Company Admins to create Marketers.
   * Password is prefixed and forcePasswordChange is set to true.
   */
  static async createMarketer(
    companyId: string,
    data: z.infer<typeof MarketerCreateSchema>,
  ) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictError("Marketer email already in use");

    const tempPassword = `IFL_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const hashedPassword = await bcryptHash(tempPassword);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: "MARKETER",
        companyId: companyId,
        forcePasswordChange: true,
      },
      select: {
        userId: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        forcePasswordChange: true,
      },
    });

    // ✅ Fires → notification-hub → email_queue → email-worker → Brevo (marketer-welcome)
    emitEvent(DomainEvent.MARKETER_CREATED, {
      email: user.email,
      name: user.name,
      tempPassword,
      dashboard_url: process.env.FRONTEND_URL,
    });

    return { user, tempPassword };
  }

  /**
   * Authenticate user and issue dual tokens (Access + Refresh).
   */
  static async login(data: z.infer<typeof LoginSchema>) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (!user) throw new UnauthorizedError("Invalid credentials");

    const validPassword = await bcryptCompare(data.password, user.password);
    if (!validPassword) throw new UnauthorizedError("Invalid credentials");

    const refreshToken = generateRefreshToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      companyId: user.companyId || undefined,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await prisma.userSession.create({
      data: {
        user: { connect: { userId: user.userId } },
        tokenHash: refreshToken,
        expiresAt,
      },
    });

    const accessToken = generateAccessToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      sessionId: session.sessionId,
      companyId: user.companyId || undefined,
    });

    return {
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        forcePasswordChange: user.forcePasswordChange,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Revoke a specific session by its public sessionId.
   */
  static async revokeSession(sessionId: string, userId: string) {
    const session = await prisma.userSession.findUnique({
      where: { sessionId },
      include: { user: true },
    });
    if (!session || session.user.userId !== userId) {
      throw new NotFoundError("Session not found");
    }

    await prisma.userSession.update({
      where: { sessionId },
      data: { revoked: true },
    });
  }

  /**
   * Logout: revoke session + clear all active sessions for the user if requested.
   */
  static async logout(sessionId: string | undefined, userId: string) {
    if (sessionId) {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
        include: { user: true },
      });

      if (session && session.user.userId === userId) {
        await prisma.userSession.update({
          where: { sessionId },
          data: { revoked: true },
        });
      }
    } else {
      const user = await prisma.user.findUnique({ where: { userId } });
      if (user) {
        await prisma.userSession.updateMany({
          where: { user: { userId: user.userId }, revoked: false },
          data: { revoked: true },
        });
      }
    }
  }

  /**
   * Rotate Access Token using a valid, un-revoked Refresh Token.
   */
  static async refresh(refreshToken: string) {
    let decoded: { userId: string; role: string; email: string };

    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const activeSession = await prisma.userSession.findUnique({
      where: { tokenHash: refreshToken },
    });
    if (
      !activeSession ||
      activeSession.revoked ||
      activeSession.expiresAt < new Date()
    ) {
      throw new UnauthorizedError("Refresh token revoked or expired");
    }

    const user = await prisma.user.findUnique({
      where: { userId: decoded.userId },
    });
    if (!user) throw new UnauthorizedError("User no longer exists");

    const newAccessToken = generateAccessToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      sessionId: activeSession.sessionId,
      companyId: user.companyId || undefined,
    });

    return { accessToken: newAccessToken };
  }

  /**
   * Forgot password: generate OTP and dispatch via notification hub.
   */

  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return {
        message:
          "If this email is registered, a password reset OTP has been sent.",
      };
    }

    const now = new Date();

    const recentRequests = await prisma.passwordReset.findMany({
      where: {
        user: { userId: user.userId },
        createdAt: {
          gt: new Date(now.getTime() - 15 * 60 * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 🔹 Cooldown (60s)
    if (recentRequests.length > 0) {
      const lastRequest = recentRequests[0];
      const secondsSinceLast =
        (now.getTime() - lastRequest.createdAt.getTime()) / 1000;

      if (secondsSinceLast < 60) {
        throw new ConflictError(
          `Please wait ${Math.ceil(60 - secondsSinceLast)} seconds before requesting another OTP`,
        );
      }
    }

    // 🔹 Max 3 requests in 15 mins
    if (recentRequests.length >= 3) {
      throw new ConflictError(
        "Too many password reset requests. Please try again later.",
      );
    }

    // 🔹 Invalidate previous OTPs
    await prisma.passwordReset.updateMany({
      where: {
        user: { userId: user.userId },
        used: false,
      },
      data: { used: true },
    });

    const otp = crypto.randomInt(100_000, 999_999).toString();
    const otpHash = await bcryptHash(otp);

    await prisma.passwordReset.create({
      data: {
        user: { connect: { userId: user.userId } },
        otpHash,
        attempts: 0,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    });

    emitEvent(DomainEvent.PASSWORD_RESET_REQUESTED, {
      email: user.email,
      name: user.name,
      otp,
    });

    return {
      message:
        "If this email is registered, a password reset OTP has been sent.",
    };
  }

  /**
   * Reset password: validate the OTP and set a new password.
   */
  static async resetPassword(data: z.infer<typeof ResetPasswordSchema>) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) throw new BadRequestError("Invalid or expired reset OTP");

    const resetEntry = await prisma.passwordReset.findFirst({
      where: {
        user: { userId: user.userId },
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!resetEntry) throw new BadRequestError("Invalid or expired reset OTP");

    const validOtp = await bcryptCompare(data.token, resetEntry.otpHash);
    if (!validOtp) {
      await prisma.passwordReset.update({
        where: { id: resetEntry.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestError("Invalid or expired reset OTP");
    }

    const hashedPassword = await bcryptHash(data.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: user.userId },
        data: {
          password: hashedPassword,
          forcePasswordChange: false,
        },
      });

      await tx.passwordReset.update({
        where: { id: resetEntry.id },
        data: { used: true },
      });

      await tx.userSession.updateMany({
        where: { user: { userId: user.userId }, revoked: false },
        data: { revoked: true },
      });
    });

    // ✅ Fires → notification-hub → email_queue → email-worker → Brevo (password-reset)
    emitEvent(DomainEvent.PASSWORD_RESET_COMPLETED, {
      email: user.email,
      name: user.name,
    });

    return { message: "Password has been reset successfully" };
  }

  /**
   * Change password: for authenticated users who know their current password.
   */
  static async changePassword(
    userId: string,
    data: z.infer<typeof ChangePasswordSchema>,
  ) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw new NotFoundError("User not found");

    const validCurrent = await bcryptCompare(
      data.currentPassword,
      user.password,
    );
    if (!validCurrent) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const hashedPassword = await bcryptHash(data.newPassword);
    await prisma.user.update({
      where: { userId },
      data: {
        password: hashedPassword,
        forcePasswordChange: false,
      },
    });

    await prisma.userSession.updateMany({
      where: { user: { userId: user.userId }, revoked: false },
      data: { revoked: true },
    });

    return { message: "Password changed successfully" };
  }
}
