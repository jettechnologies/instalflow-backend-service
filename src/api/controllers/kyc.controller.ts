import { Request, Response, NextFunction } from "express";
import { KycService } from "@/core/services/kyc.service";
import ApiResponse from "@/shared/utils/ApiResponse";
import {
  GenerateReferralLinkSchema,
  InviteRegisterSchema,
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
      const marketerId = (req as any).user?.userId;
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

  static async submitApplication(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const customerId = (req as any).onboardingCustomerId!;
      const params = SubmitApplicationSchema.parse(req.body);
      const file = req.file;

      const result = await KycService.submitApplication(
        customerId,
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
      const reviewerId = (req as any).user?.userId;
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
      const adminId = (req as any).user?.userId;
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
      const reviewerId = (req as any).user?.userId;
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
      const reviewerId = (req as any).user?.userId;
      const reviewerRole = (req as any).user?.role;

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

      const result = await KycService.getKycApplicationById(applicationId);

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
