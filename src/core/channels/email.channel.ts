// src/core/channels/email.channel.ts
import { EmailService } from "@/core/services/email.service";

export class EmailChannel {
  static async send(payload: any) {
    return EmailService.sendMail({
      to: payload.to,
      subject: payload.subject!,
      template: payload.template,
      context: payload.context,
    });
  }
}
