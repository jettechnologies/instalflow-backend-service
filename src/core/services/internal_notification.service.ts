// import { NotificationRepository } from "./notification.repository";
import { NotificationRepository } from "@/infrastructure/internal_notification/notification.repository";
import { NotFoundError } from "@/shared/utils/AppError";

export class InternalNotificationService {
  static async getNotifications(userId: string, page = 1, limit = 20) {
    return NotificationRepository.findMany(
      {
        userId,
      },
      page,
      limit,
    );
  }

  static async getUnreadCount(userId: string) {
    const unreadCount = await NotificationRepository.countUnread(userId);

    return {
      unreadCount,
    };
  }

  static async markAsRead(userId: string, notificationId: string) {
    const notification = await NotificationRepository.findById(
      userId,
      notificationId,
    );

    if (!notification) {
      throw new NotFoundError("Notification not found.");
    }

    await NotificationRepository.markAsRead(userId, notificationId);

    return {
      success: true,
    };
  }

  static async markSelectedAsRead(userId: string, notificationIds: string[]) {
    const result = await NotificationRepository.markManyAsRead(
      userId,
      notificationIds,
    );

    return {
      updated: result.count,
    };
  }

  static async markAllAsRead(userId: string) {
    const result = await NotificationRepository.markAllAsRead(userId);

    return {
      updated: result.count,
    };
  }
}
