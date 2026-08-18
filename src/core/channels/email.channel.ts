// src/core/channels/email.channel.ts
import {
  EmailService,
  type EmailTemplate,
} from "@/core/services/email.service";
import type { NotificationPayload } from "@/core/notifications/notification.type";

export class EmailChannel {
  static async send(payload: NotificationPayload) {
    return EmailService.sendMail({
      to: payload.to,
      subject: payload.subject ?? "",
      template: payload.template as EmailTemplate,
      context: payload.context,
    });
  }
}
