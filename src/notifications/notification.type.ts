// src/notifications/notification.types.ts
export enum NotificationChannel {
  EMAIL = "email",
  SMS = "sms",
}

export interface NotificationPayload {
  to: string;
  channel: NotificationChannel;
  template: string;
  subject?: string;
  context: Record<string, any>;
}

export interface NotificationResponse {
  success: boolean;
  error?: string;
}
