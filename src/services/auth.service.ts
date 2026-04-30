import { prisma } from "@/prisma/client.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
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
} from "../schema/auth.schema";
import { emitEvent } from "@/events/emitter"; // ← updated import
import { DomainEvent } from "@/events/event.types";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

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

    const hashedPassword = await bcrypt.hash(data.password, 10);
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

    // ✅ Fires → notification-hub → email_queue → email-worker → Brevo (welcome)
    emitEvent(DomainEvent.USER_REGISTERED, {
      email: user.email,
      name: user.name,
      dashboard_url: process.env.FRONTEND_URL,
    });

    return user;
  }

  /**
   * Onboard a brand new Company + Admin User
   */
  static async onboardCompany(data: z.infer<typeof CompanyRegisterSchema>) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictError("Admin email already in use");

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: data.companyName },
      });

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

      return { company, user };
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
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

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

    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) throw new UnauthorizedError("Invalid credentials");

    const accessToken = jwt.sign(
      { userId: user.userId, role: user.role, companyId: user.companyId },
      ACCESS_SECRET,
      { expiresIn: "15m" },
    );

    const refreshToken = jwt.sign({ userId: user.userId }, REFRESH_SECRET, {
      expiresIn: "7d",
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await prisma.userSession.create({
      data: {
        userId: user.userId,
        token: refreshToken,
        expiresAt,
      },
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
      sessionId: session.sessionId,
    };
  }

  /**
   * Revoke a specific session by its public sessionId.
   */
  static async revokeSession(sessionId: string, userId: string) {
    const session = await prisma.userSession.findUnique({
      where: { sessionId },
    });
    if (!session || session.userId !== userId) {
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
      });

      if (session && session.userId === userId) {
        await prisma.userSession.update({
          where: { sessionId },
          data: { revoked: true },
        });
      }
    } else {
      await prisma.userSession.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    }
  }

  /**
   * Rotate Access Token using a valid, un-revoked Refresh Token.
   */
  static async refresh(refreshToken: string) {
    let decoded: { userId: string };

    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET) as { userId: string };
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const activeSession = await prisma.userSession.findUnique({
      where: { token: refreshToken },
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

    const newAccessToken = jwt.sign(
      { userId: user.userId, role: user.role, companyId: user.companyId },
      ACCESS_SECRET,
      { expiresIn: "15m" },
    );

    return { accessToken: newAccessToken };
  }

  /**
   * Forgot password: generate OTP and dispatch via notification hub.
   */
  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        message: "If this email is registered, a reset OTP has been sent.",
      };
    }

    const otp = crypto.randomInt(100_000, 999_999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { email },
      data: {
        resetToken: otp,
        resetTokenExpiresAt: expiresAt,
      },
    });

    // ✅ Fires → notification-hub → email_queue → email-worker → Brevo (forgot-password-otp)
    emitEvent(DomainEvent.PASSWORD_RESET_REQUESTED, {
      email: user.email,
      name: user.name,
      otp,
    });

    return {
      message: "If this email is registered, a reset OTP has been sent.",
    };
  }

  /**
   * Reset password: validate the OTP and set a new password.
   */
  static async resetPassword(token: string, newPassword: string) {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiresAt: { gt: new Date() },
      },
    });

    if (!user) throw new BadRequestError("Invalid or expired reset OTP");

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { userId: user.userId },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });

    await prisma.userSession.updateMany({
      where: { userId: user.userId, revoked: false },
      data: { revoked: true },
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

    const validCurrent = await bcrypt.compare(
      data.currentPassword,
      user.password,
    );
    if (!validCurrent) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);
    await prisma.user.update({
      where: { userId },
      data: {
        password: hashedPassword,
        forcePasswordChange: false,
      },
    });

    await prisma.userSession.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    return { message: "Password changed successfully" };
  }
}

// import { prisma } from "@/prisma/client.js";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import crypto from "crypto";
// import { z } from "zod";
// import {
//   ConflictError,
//   UnauthorizedError,
//   NotFoundError,
//   BadRequestError,
// } from "../libs/AppError";
// import {
//   RegisterSchema,
//   LoginSchema,
//   ChangePasswordSchema,
//   CompanyRegisterSchema,
//   MarketerCreateSchema,
// } from "../schema/auth.schema";
// import { emitEvent } from "@/events/emitter-secondary";
// import { DomainEvent } from "@/events/event.types";

// const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret_fallback";
// const REFRESH_SECRET =
//   process.env.JWT_REFRESH_SECRET || "refresh_secret_fallback";

// export class AuthService {
//   /**
//    * Register a new customer account.
//    */
//   static async register(data: z.infer<typeof RegisterSchema>) {
//     const existing = await prisma.user.findUnique({
//       where: { email: data.email },
//     });
//     if (existing) throw new ConflictError("Email is already in use");

//     // Logic: If referredByMarketerId exists, verify it belongs to a MARKETER
//     if (data.referredByMarketerId) {
//       const marketer = await prisma.user.findUnique({
//         where: { userId: data.referredByMarketerId, role: "MARKETER" },
//       });
//       if (!marketer)
//         throw new BadRequestError("Invalid referral: Marketer not found.");
//     }

//     const hashedPassword = await bcrypt.hash(data.password, 10);
//     const user = await prisma.user.create({
//       data: {
//         name: data.name,
//         email: data.email,
//         password: hashedPassword,
//         role: "CUSTOMER",
//         referredByMarketerId: data.referredByMarketerId,
//       },
//       select: {
//         userId: true,
//         name: true,
//         email: true,
//         role: true,
//         referredByMarketerId: true,
//         createdAt: true,
//       },
//     });

//     emitEvent(DomainEvent.USER_REGISTERED, {
//       userId: user.userId,
//       email: user.email,
//       name: user.name,
//     });

//     return user;
//   }

//   /**
//    * Onboard a brand new Company + Admin User
//    */
//   static async onboardCompany(data: z.infer<typeof CompanyRegisterSchema>) {
//     const existing = await prisma.user.findUnique({
//       where: { email: data.email },
//     });
//     if (existing) throw new ConflictError("Admin email already in use");

//     const hashedPassword = await bcrypt.hash(data.password, 10);

//     return await prisma.$transaction(async (tx) => {
//       const company = await tx.company.create({
//         data: { name: data.companyName },
//       });

//       const user = await tx.user.create({
//         data: {
//           name: data.adminName,
//           email: data.email,
//           password: hashedPassword,
//           role: "COMPANY",
//           companyId: company.companyId,
//         },
//         select: {
//           userId: true,
//           name: true,
//           email: true,
//           role: true,
//           companyId: true,
//           createdAt: true,
//         },
//       });

//       return { company, user };
//     });
//   }

//   /**
//    * For Company Admins to create Marketers
//    * Password is prefixed and forcePasswordChange is set to true
//    */
//   static async createMarketer(
//     companyId: string,
//     data: z.infer<typeof MarketerCreateSchema>,
//   ) {
//     const existing = await prisma.user.findUnique({
//       where: { email: data.email },
//     });
//     if (existing) throw new ConflictError("Marketer email already in use");

//     // Generate a prefixed temporary password
//     const tempPassword = `IFL_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
//     const hashedPassword = await bcrypt.hash(tempPassword, 10);

//     const user = await prisma.user.create({
//       data: {
//         name: data.name,
//         email: data.email,
//         password: hashedPassword,
//         role: "MARKETER",
//         companyId: companyId,
//         forcePasswordChange: true,
//       },
//       select: {
//         userId: true,
//         name: true,
//         email: true,
//         role: true,
//         companyId: true,
//         forcePasswordChange: true,
//       },
//     });

//     return { user, tempPassword };
//   }

//   /**
//    * Authenticate user and issue dual tokens (Access + Refresh).
//    */
//   static async login(data: z.infer<typeof LoginSchema>) {
//     const user = await prisma.user.findUnique({
//       where: { email: data.email },
//     });
//     if (!user) throw new UnauthorizedError("Invalid credentials");

//     const validPassword = await bcrypt.compare(data.password, user.password);
//     if (!validPassword) throw new UnauthorizedError("Invalid credentials");

//     // 15-minute Access Token
//     const accessToken = jwt.sign(
//       { userId: user.userId, role: user.role, companyId: user.companyId },
//       ACCESS_SECRET,
//       { expiresIn: "15m" },
//     );

//     // 7-day Refresh Token
//     const refreshToken = jwt.sign({ userId: user.userId }, REFRESH_SECRET, {
//       expiresIn: "7d",
//     });

//     const expiresAt = new Date();
//     expiresAt.setDate(expiresAt.getDate() + 7);

//     const session = await prisma.userSession.create({
//       data: {
//         userId: user.userId,
//         token: refreshToken,
//         expiresAt,
//       },
//     });

//     return {
//       user: {
//         userId: user.userId,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//         forcePasswordChange: user.forcePasswordChange,
//         createdAt: user.createdAt,
//       },
//       accessToken,
//       refreshToken,
//       sessionId: session.sessionId,
//     };
//   }

//   /**
//    * Revoke a specific session by its public sessionId.
//    */
//   static async revokeSession(sessionId: string, userId: string) {
//     const session = await prisma.userSession.findUnique({
//       where: { sessionId },
//     });
//     if (!session || session.userId !== userId) {
//       throw new NotFoundError("Session not found");
//     }

//     await prisma.userSession.update({
//       where: { sessionId },
//       data: { revoked: true },
//     });
//   }

//   /**
//    * Logout: revoke session + clear all active sessions for the user if requested.
//    */
//   static async logout(sessionId: string | undefined, userId: string) {
//     if (sessionId) {
//       // Revoke the specific session
//       const session = await prisma.userSession.findUnique({
//         where: { sessionId },
//       });

//       if (session && session.userId === userId) {
//         await prisma.userSession.update({
//           where: { sessionId },
//           data: { revoked: true },
//         });
//       }
//     } else {
//       // No sessionId provided — revoke ALL active sessions for this user
//       await prisma.userSession.updateMany({
//         where: { userId, revoked: false },
//         data: { revoked: true },
//       });
//     }
//   }

//   /**
//    * Rotate Access Token using a valid, un-revoked Refresh Token.
//    */
//   static async refresh(refreshToken: string) {
//     let decoded: { userId: string };

//     try {
//       decoded = jwt.verify(refreshToken, REFRESH_SECRET) as {
//         userId: string;
//       };
//     } catch {
//       throw new UnauthorizedError("Invalid or expired refresh token");
//     }

//     // Stateful check: DB rotation / revocation
//     const activeSession = await prisma.userSession.findUnique({
//       where: { token: refreshToken },
//     });
//     if (
//       !activeSession ||
//       activeSession.revoked ||
//       activeSession.expiresAt < new Date()
//     ) {
//       throw new UnauthorizedError("Refresh token revoked or expired");
//     }

//     const user = await prisma.user.findUnique({
//       where: { userId: decoded.userId },
//     });
//     if (!user) throw new UnauthorizedError("User no longer exists");

//     const newAccessToken = jwt.sign(
//       { userId: user.userId, role: user.role, companyId: user.companyId },
//       ACCESS_SECRET,
//       { expiresIn: "15m" },
//     );

//     return { accessToken: newAccessToken };
//   }

//   /**
//    * Forgot password: generate a time-limited reset token and return it.
//    * In production, email this token via your mail-worker instead of returning it.
//    */
//   static async forgotPassword(email: string) {
//     const user = await prisma.user.findUnique({ where: { email } });
//     if (!user) {
//       // For security, never reveal whether the email exists
//       return {
//         message: "If this email is registered, a reset link has been sent.",
//       };
//     }

//     // Generate a cryptographically secure reset token
//     const resetToken = crypto.randomBytes(32).toString("hex");
//     const hashedToken = crypto
//       .createHash("sha256")
//       .update(resetToken)
//       .digest("hex");

//     const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

//     // Store the hashed token on the user record
//     await prisma.user.update({
//       where: { email },
//       data: {
//         resetToken: hashedToken,
//         resetTokenExpiresAt: expiresAt,
//       },
//     });

//     // TODO: Dispatch the raw `resetToken` via your mail-worker service.
//     // The raw token is what the user receives; we only store the hash.

//     return {
//       message: "If this email is registered, a reset link has been sent.",
//       // Only expose the raw token in development for testing
//       ...(process.env.NODE_ENV !== "production" && { resetToken }),
//     };
//   }

//   /**
//    * Reset password: validate the reset token and set a new password.
//    */
//   static async resetPassword(token: string, newPassword: string) {
//     const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

//     const user = await prisma.user.findFirst({
//       where: {
//         resetToken: hashedToken,
//         resetTokenExpiresAt: { gt: new Date() },
//       },
//     });

//     if (!user) throw new BadRequestError("Invalid or expired reset token");

//     const hashedPassword = await bcrypt.hash(newPassword, 10);

//     await prisma.user.update({
//       where: { userId: user.userId },
//       data: {
//         password: hashedPassword,
//         resetToken: null,
//         resetTokenExpiresAt: null,
//       },
//     });

//     // Revoke all existing sessions so the user must re-authenticate
//     await prisma.userSession.updateMany({
//       where: { userId: user.userId, revoked: false },
//       data: { revoked: true },
//     });

//     return { message: "Password has been reset successfully" };
//   }

//   /**
//    * Change password: for authenticated users who know their current password.
//    */
//   static async changePassword(
//     userId: string,
//     data: z.infer<typeof ChangePasswordSchema>,
//   ) {
//     const user = await prisma.user.findUnique({ where: { userId } });
//     if (!user) throw new NotFoundError("User not found");

//     const validCurrent = await bcrypt.compare(
//       data.currentPassword,
//       user.password,
//     );
//     if (!validCurrent) {
//       throw new UnauthorizedError("Current password is incorrect");
//     }

//     const hashedPassword = await bcrypt.hash(data.newPassword, 10);
//     await prisma.user.update({
//       where: { userId },
//       data: {
//         password: hashedPassword,
//         forcePasswordChange: false, // Reset flag after manual change
//       },
//     });

//     // Revoke all other sessions except the current one to force re-login
//     await prisma.userSession.updateMany({
//       where: { userId, revoked: false },
//       data: { revoked: true },
//     });

//     return { message: "Password changed successfully" };
//   }
// }
