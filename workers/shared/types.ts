export interface EmailQueueMessage {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

export interface SmsQueueMessage {
  to: string;
  message: string;
}

export enum NotificationChannel {
  EMAIL = "email",
  SMS = "sms",
}
