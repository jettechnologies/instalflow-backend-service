// src/core/notifications/notification.service.ts
import { NotificationPayload, NotificationChannel } from "@/core/notifications/notification.type";
import { EmailChannel } from "@/core/channels/email.channel";

export class NotificationService {
  static async send(notification: NotificationPayload) {
    switch (notification.channel) {
      case NotificationChannel.EMAIL:
        if (process.env.NOTIFICATION_HUB_URL) {
          console.log(
            `[NotificationService] NOTIFICATION_HUB_URL is configured — skipping local email delivery to ${notification.to} (delegating to hub)`
          );
          return { success: true, skipped: true };
        }
        return EmailChannel.send(notification);

      default:
        throw new Error(`Unsupported channel: ${notification.channel}`);
    }
  }
}
