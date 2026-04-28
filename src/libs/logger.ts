import { PostHog } from 'posthog-node';
import dotenv from 'dotenv';
dotenv.config();

const client = new PostHog(
  process.env.POSTHOG_API_KEY || 'phc_default_key_replace_me',
  { host: process.env.POSTHOG_HOST || 'https://app.posthog.com' }
);

const logger = {
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${message}`, meta);
    try {
      client.capture({
        distinctId: process.env.NODE_ENV || 'development',
        event: 'server_error',
        properties: {
          message,
          ...meta
        }
      });
    } catch (e) {
      console.error('Failed to log to PostHog', e);
    }
  },
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${message}`, meta);
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${message}`, meta);
  }
};

export default logger;
