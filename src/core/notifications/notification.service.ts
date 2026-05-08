// src/core/notifications/notification.service.ts
import { NotificationPayload, NotificationChannel } from "@/core/notifications/notification.type";
import { EmailChannel } from "@/core/channels/email.channel";

export class NotificationService {
  static async send(notification: NotificationPayload) {
    switch (notification.channel) {
      case NotificationChannel.EMAIL:
        return EmailChannel.send(notification);

      default:
        throw new Error(`Unsupported channel: ${notification.channel}`);
    }
  }
}
