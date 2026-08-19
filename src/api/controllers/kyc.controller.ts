import type { Request, Response, NextFunction } from "express";
import { KycService, type UploadedPdfFile } from "@/core/services/kyc.service";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  GenerateReferralLinkSchema,
  InviteRegisterSchema,
  DirectRegisterSchema,
  SubmitApplicationSchema,
  RejectApplicationSchema,
} from "@/shared/schemas/kyc.schema";
import { BadRequestError } from "@/shared/utils/AppError";

export class KycController {
  static async generateReferralLink(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const marketerId = req.user?.userId;
      if (!marketerId) {
        throw new BadRequestError("Unauthorized marketer session.");
      }

      const params = GenerateReferralLinkSchema.parse(req.body);
      const result = await KycService.generateReferralLink(marketerId, params);

      return ApiResponse.success(
        res,
        200,
        "Referral link generated successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async registerViaReferral(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const params = InviteRegisterSchema.parse(req.body);
      const result = await KycService.registerViaReferral(params);

      return ApiResponse.success(
        res,
        201,
        "Customer registered via referral successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async registerDirect(req: Request, res: Response, next: NextFunction) {
    try {
      const reviewerId = req.user?.userId;
      if (!reviewerId) {
        throw new BadRequestError("Unauthorized reviewer session.");
      }

      const params = DirectRegisterSchema.parse(req.body);
      const result = await KycService.registerDirect(reviewerId, params);

      return ApiResponse.success(
        res,
        201,
        "Customer registered directly successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async generateCompanySignupCode(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const companyUserId = req.user?.userId;
      if (!companyUserId) {
        throw new BadRequestError("Unauthorized company session.");
      }

      const result = await KycService.generateCompanySignupCode(companyUserId);

      return ApiResponse.success(
        res,
        200,
        "Company signup code generated successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async submitApplication(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const sessionId = req.onboardingSessionId!;
      const params = SubmitApplicationSchema.parse(req.body);
      const file = req.file as UploadedPdfFile;

      const result = await KycService.submitApplication(
        sessionId,
        params,
        file,
      );

      return ApiResponse.success(
        res,
        201,
        "KYC application submitted successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async approveApplication(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const reviewerId = req.user?.userId;
      if (!reviewerId) {
        throw new BadRequestError("Unauthorized session.");
      }

      const applicationId = req.params.id as string;
      const result = await KycService.approveApplication(
        applicationId,
        reviewerId,
      );

      return ApiResponse.success(
        res,
        200,
        "KYC application approved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async rejectApplication(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const adminId = req.user?.userId;
      if (!adminId) {
        throw new BadRequestError("Unauthorized session.");
      }

      const applicationId = req.params.id as string;
      const body = RejectApplicationSchema.parse(req.body);

      const result = await KycService.rejectApplication(
        applicationId,
        adminId,
        body.reason,
      );

      return ApiResponse.success(
        res,
        200,
        "KYC application rejected successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getSignedDocumentUrl(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const reviewerId = req.user?.userId;
      if (!reviewerId) {
        throw new BadRequestError("Unauthorized session.");
      }

      const applicationId = req.params.id as string;
      const result = await KycService.getSignedDocumentUrl(
        applicationId,
        reviewerId,
      );

      return ApiResponse.success(
        res,
        200,
        "Signed document URL retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getAllKycApplications(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const reviewerId = req.user?.userId;
      const reviewerRole = req.user?.role;
      const companyId = req.user?.companyId;

      if (!reviewerId || !reviewerRole) {
        throw new BadRequestError("Unauthorized session.");
      }

      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 10);
      const sortOrder = (req.query.sortOrder as "asc" | "desc") || "desc";
      const status = req.query.status as string | undefined;
      const marketerId = req.query.marketerId as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await KycService.getAllKycApplications({
        reviewerId,
        reviewerRole,
        companyId,
        page,
        limit,
        sortOrder,
        status,
        marketerId,
        search,
      });

      return ApiResponse.success(
        res,
        200,
        "KYC applications retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getKycApplicationById(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const applicationId = req.params.id as string;
      const reviewerId = req.user!.userId;
      const reviewerRole = req.user!.role;

      const result = await KycService.getKycApplicationById(
        applicationId,
        reviewerId,
        reviewerRole,
      );

      return ApiResponse.success(
        res,
        200,
        "KYC application retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }
}
