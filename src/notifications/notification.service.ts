// src/notifications/notification.service.ts
// import { NotificationChannel, NotificationPayload } from "./notification.types";
import { NotificationPayload, NotificationChannel } from "./notification.type";
import { EmailChannel } from "@/channels/email.channel";

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
