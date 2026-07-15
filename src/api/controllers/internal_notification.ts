import { Request, Response } from "express";
import { InternalNotificationService } from "@/core/services/internal_notification.service";
import ApiResponse from "@/shared/utils/ApiResponse";

export class NotificationController {
  static async getNotifications(req: Request, res: Response) {
    const userId = req?.user?.userId!;

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const data = await InternalNotificationService.getNotifications(
      userId,
      page,
      limit,
    );

    return ApiResponse.success(
      res,
      200,
      "Notifications retrieved successfully.",
      data,
    );
  }

  static async getUnreadCount(req: Request, res: Response) {
    const userId = req?.user?.userId!;

    const data = await InternalNotificationService.getUnreadCount(userId);

    return ApiResponse.success(
      res,
      200,
      "Unread notification count retrieved successfully.",
      data,
    );
  }

  static async markAsRead(req: Request, res: Response) {
    const userId = req?.user?.userId!;

    const notificationId = req.params.notificationId as string;

    const data = await InternalNotificationService.markAsRead(
      userId,
      notificationId,
    );

    return ApiResponse.success(
      res,
      200,
      "Notification marked as read successfully.",
      data,
    );
  }

  static async markSelectedAsRead(req: Request, res: Response) {
    const userId = req?.user?.userId!;

    const { notificationIds } = req.body;

    const data = await InternalNotificationService.markSelectedAsRead(
      userId,
      notificationIds,
    );

    return ApiResponse.success(
      res,
      200,
      "Selected notifications marked as read successfully.",
      data,
    );
  }

  static async markAllAsRead(req: Request, res: Response) {
    const userId = req?.user?.userId!;

    const data = await InternalNotificationService.markAllAsRead(userId);

    return ApiResponse.success(
      res,
      200,
      "All notifications marked as read successfully.",
      data,
    );
  }
}
