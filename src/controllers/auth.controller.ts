import type { Request, Response } from "express";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ChangePasswordSchema,
  CompanyRegisterSchema,
  MarketerCreateSchema,
} from "../schema/auth.schema";
import { AuthService } from "../services/auth.service";
import ApiResponse from "../libs/ApiResponse";
import { ForbiddenError } from "../libs/AppError";

export class AuthController {
  static async register(req: Request, res: Response) {
    const payload = RegisterSchema.parse(req.body);
    const user = await AuthService.register(payload);

    res.cookie("refresh_token", user.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return ApiResponse.success(
      res,
      201,
      "Customer registered successfully",
      user,
    );
  }

  /**
   * For onboarding a new company tenant
   */
  static async onboardCompany(req: Request, res: Response) {
    const payload = CompanyRegisterSchema.parse(req.body);
    const result = await AuthService.onboardCompany(payload);

    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return ApiResponse.success(
      res,
      201,
      "Company and Admin created successfully",
      result,
    );
  }

  /**
   * For Company/Admin users to create marketers
   */
  static async createMarketer(req: Request, res: Response) {
    const payload = MarketerCreateSchema.parse(req.body);
    const admin = req.user!;

    // Security: Only COMPANY or ADMIN/SUPER_ADMIN can create marketers
    if (!["COMPANY", "ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
      throw new ForbiddenError(
        "Only company administrators can create marketers",
      );
    }

    if (!admin.companyId && admin.role === "COMPANY") {
      throw new ForbiddenError(
        "Administrator must be associated with a company",
      );
    }

    const { user, tempPassword } = await AuthService.createMarketer(
      admin.companyId!,
      payload,
    );

    return ApiResponse.success(res, 201, "Marketer created successfully", {
      user,
      tempPassword,
      instructions:
        "Please provide the temporary password to the marketer. They will be prompted to change it upon first login.",
    });
  }

  static async login(req: Request, res: Response) {
    const payload = LoginSchema.parse(req.body);
    const { user, accessToken, refreshToken } =
      await AuthService.login(payload);

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return ApiResponse.success(res, 200, "Login successful", {
      user,
      accessToken,
      message: user.forcePasswordChange
        ? "CONSENT_REQUIRED: You must change your password before proceeding."
        : undefined,
    });
  }

  static async refresh(req: Request, res: Response) {
    const refreshToken =
      req.cookies?.refresh_token || req.headers.authorization?.split(" ")[1];

    if (!refreshToken) {
      return ApiResponse.unauthorized(res, "Refresh token required");
    }

    const tokens = await AuthService.refresh(refreshToken);
    return ApiResponse.success(res, 200, "Tokens refreshed", tokens);
  }

  static async logout(req: Request, res: Response) {
    const sessionId = req.body.sessionId || req.user?.sessionId;
    const userId = req.user!.userId;

    await AuthService.logout(sessionId, userId);

    res.clearCookie("refresh_token");
    return ApiResponse.success(res, 200, "Logged out successfully");
  }

  static async forgotPassword(req: Request, res: Response) {
    const { email } = ForgotPasswordSchema.parse(req.body);
    const result = await AuthService.forgotPassword(email);

    return ApiResponse.success(res, 200, result.message, result);
  }

  static async resetPassword(req: Request, res: Response) {
    const payload = ResetPasswordSchema.parse(req.body);
    const result = await AuthService.resetPassword(payload);

    return ApiResponse.success(res, 200, result.message);
  }

  static async changePassword(req: Request, res: Response) {
    const userId = req.user!.userId;
    const payload = ChangePasswordSchema.parse(req.body);
    const result = await AuthService.changePassword(userId, payload);

    return ApiResponse.success(res, 200, result.message);
  }
}
