import { Request, Response, NextFunction } from "express";
import { KycService } from "@/core/services/kyc.service";
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

      res.status(200).json(result);
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

      res.status(201).json(result);
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

      res.status(201).json(result);
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

      res.status(200).json(result);
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

      res.status(200).json(result);
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

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /kyc/notifications
   * Restricted to logged-in Marketers or Admins.
   */
  // static async getNotifications(
  //   req: Request,
  //   res: Response,
  //   next: NextFunction,
  // ) {
  //   try {
  //     const userId = (req as any).user?.userId;
  //     if (!userId) {
  //       throw new BadRequestError("Unauthorized user session.");
  //     }

  //     const notifications = await KycService.getNotifications(userId);
  //     res.status(200).json(notifications);
  //   } catch (error) {
  //     next(error);
  //   }
  // }

  // /**
  //  * PATCH /kyc/notifications/:id/read
  //  * Scopes reading/updating directly to the userId.
  //  */
  // static async markAsRead(req: Request, res: Response, next: NextFunction) {
  //   try {
  //     const userId = (req as any).user?.userId;
  //     if (!userId) {
  //       throw new BadRequestError("Unauthorized user session.");
  //     }

  //     const notificationId = req.params.id as string;
  //     const result = await KycService.markAsRead(
  //       userId,
  //       notificationId,
  //     );

  //     res.status(200).json({
  //       success: true,
  //       message: "Notification marked as read.",
  //       notificationId: result.notificationId,
  //       isRead: result.isRead,
  //     });
  //   } catch (error) {
  //     next(error);
  //   }
  // }
}
