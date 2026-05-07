// logger.ts
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const otelLogger = logs.getLogger(process.env.SERVICE_NAME || "api");

// ─── Emit Helper ──────────────────────────────────────────────────────────────
function emit(
  severityText: "trace" | "debug" | "info" | "warn" | "error" | "fatal",
  body: string,
  attributes: Record<string, any> = {},
) {
  const severityMap: Record<string, SeverityNumber> = {
    trace: SeverityNumber.TRACE,
    debug: SeverityNumber.DEBUG,
    info: SeverityNumber.INFO,
    warn: SeverityNumber.WARN,
    error: SeverityNumber.ERROR,
    fatal: SeverityNumber.FATAL,
  };

  try {
    otelLogger.emit({
      severityNumber: severityMap[severityText],
      severityText,
      body,
      attributes: {
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
        ...attributes,
      },
    });
  } catch (e) {
    console.error("[OTel] Failed to emit log", e);
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────
const logger = {
  trace: (message: string, meta?: Record<string, any>) => {
    console.trace(`[TRACE] ${message}`, meta);
    emit("trace", message, meta);
  },

  debug: (message: string, meta?: Record<string, any>) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[DEBUG] ${message}`, meta);
    }
    emit("debug", message, meta);
  },

  info: (message: string, meta?: Record<string, any>) => {
    console.log(`[INFO] ${message}`, meta);
    emit("info", message, meta);
  },

  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(`[WARN] ${message}`, meta);
    emit("warn", message, meta);
  },

  error: (message: string, meta?: Record<string, any>) => {
    console.error(`[ERROR] ${message}`, meta);
    emit("error", message, {
      ...meta,
      // Unwrap Error objects into indexable fields
      ...(meta?.error instanceof Error && {
        error_message: meta.error.message,
        error_stack: meta.error.stack,
        error_name: meta.error.name,
      }),
    });
  },

  fatal: (message: string, meta?: Record<string, any>) => {
    console.error(`[FATAL] ${message}`, meta);
    emit("fatal", message, {
      ...meta,
      ...(meta?.error instanceof Error && {
        error_message: meta.error.message,
        error_stack: meta.error.stack,
        error_name: meta.error.name,
      }),
    });
  },

  // ─── Webhook Namespace ──────────────────────────────────────────────────────
  webhook: {
    received: (event: string, meta?: Record<string, any>) => {
      console.log(`[WEBHOOK] Received: ${event}`, meta);
      emit("info", "webhook_received", {
        webhook_event: event,
        ...meta,
      });
    },

    signatureFailure: (meta?: Record<string, any>) => {
      console.error("[WEBHOOK] Invalid signature", meta);
      emit("error", "webhook_signature_failure", { ...meta });
    },

    duplicate: (eventId: string, meta?: Record<string, any>) => {
      console.warn(`[WEBHOOK] Duplicate blocked: ${eventId}`, meta);
      emit("warn", "webhook_duplicate_blocked", {
        event_id: eventId,
        ...meta,
      });
    },

    processed: (event: string, meta?: Record<string, any>) => {
      console.log(`[WEBHOOK] Processed: ${event}`, meta);
      emit("info", "webhook_processed", {
        webhook_event: event,
        ...meta,
      });
    },

    failed: (event: string, error: any, meta?: Record<string, any>) => {
      console.error(`[WEBHOOK] Failed: ${event}`, error, meta);
      emit("error", "webhook_failed", {
        webhook_event: event,
        error_message: error?.message || String(error),
        error_stack: error?.stack,
        ...meta,
      });
    },

    // ─── Paystack Namespace ───────────────────────────────────────────────────
    paystack: {
      chargeSuccess: (
        reference: string,
        metadataType: string,
        meta?: Record<string, any>,
      ) => {
        console.log(
          `[WEBHOOK:PAYSTACK] charge.success | ref: ${reference} | type: ${metadataType}`,
        );
        emit("info", "paystack_charge_success", {
          reference,
          metadata_type: metadataType,
          ...meta,
        });
      },

      onboardingQueued: (intentId: string, reference: string) => {
        console.log(
          `[WEBHOOK:PAYSTACK] Onboarding queued | intentId: ${intentId}`,
        );
        emit("info", "paystack_onboarding_queued", {
          intent_id: intentId,
          reference,
        });
      },

      subscriptionFallback: (reference: string) => {
        console.log(
          `[WEBHOOK:PAYSTACK] Subscription fallback | ref: ${reference}`,
        );
        emit("info", "paystack_subscription_fallback", { reference });
      },
    },
  },
};

export default logger;

// // logger.ts
// import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
// import { resourceFromAttributes } from "@opentelemetry/resources";
// import {
//   LoggerProvider,
//   SimpleLogRecordProcessor,
// } from "@opentelemetry/sdk-logs";
// import { SeverityNumber } from "@opentelemetry/api-logs";
// import dotenv from "dotenv";
// dotenv.config();

// // ─── Provider Setup ───────────────────────────────────────────────────────────
// const exporter = new OTLPLogExporter({
//   url: `${process.env.POSTHOG_HOST || "https://us.i.posthog.com"}/otlp/v1/logs`,
//   headers: {
//     Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`,
//   },
// });

// const loggerProvider = new LoggerProvider({
//   resource: resourceFromAttributes({
//     "service.name": process.env.SERVICE_NAME || "api",
//     "service.environment": process.env.NODE_ENV || "development",
//     "service.version": process.env.npm_package_version || "1.0.0",
//   }),
// });

// loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(exporter));

// // Drain buffer on graceful shutdown
// process.on("beforeExit", async () => {
//   await loggerProvider.shutdown();
// });

// const otelLogger = loggerProvider.getLogger(process.env.SERVICE_NAME || "api");

// // ─── Emit Helper ──────────────────────────────────────────────────────────────
// function emit(
//   severityNumber: SeverityNumber,
//   severityText: string,
//   body: string,
//   attributes: Record<string, any> = {},
// ) {
//   try {
//     otelLogger.emit({
//       severityNumber,
//       severityText,
//       body,
//       attributes: {
//         environment: process.env.NODE_ENV || "development",
//         timestamp: new Date().toISOString(),
//         ...attributes,
//       },
//     });
//   } catch (e) {
//     console.error("[OTel] Failed to emit log", e);
//   }
// }

// // ─── Logger ───────────────────────────────────────────────────────────────────
// const logger = {
//   info: (message: string, meta?: Record<string, any>) => {
//     console.log(`[INFO] ${message}`, meta);
//     emit(SeverityNumber.INFO, "INFO", message, meta);
//   },

//   warn: (message: string, meta?: Record<string, any>) => {
//     console.warn(`[WARN] ${message}`, meta);
//     emit(SeverityNumber.WARN, "WARN", message, meta);
//   },

//   error: (message: string, meta?: Record<string, any>) => {
//     console.error(`[ERROR] ${message}`, meta);
//     emit(SeverityNumber.ERROR, "ERROR", message, {
//       ...meta,
//       // Unwrap Error objects so PostHog indexes them properly
//       ...(meta?.error instanceof Error && {
//         error_message: meta.error.message,
//         error_stack: meta.error.stack,
//         error_name: meta.error.name,
//       }),
//     });
//   },

//   debug: (message: string, meta?: Record<string, any>) => {
//     if (process.env.NODE_ENV === "development") {
//       console.debug(`[DEBUG] ${message}`, meta);
//     }
//     emit(SeverityNumber.DEBUG, "DEBUG", message, meta);
//   },

//   // ─── Webhook Namespace ──────────────────────────────────────────────────────
//   webhook: {
//     received: (event: string, meta?: Record<string, any>) => {
//       console.log(`[WEBHOOK] Received: ${event}`, meta);
//       emit(SeverityNumber.INFO, "INFO", `webhook_received`, {
//         webhook_event: event,
//         ...meta,
//       });
//     },

//     signatureFailure: (meta?: Record<string, any>) => {
//       console.error("[WEBHOOK] Invalid signature", meta);
//       emit(SeverityNumber.ERROR, "ERROR", "webhook_signature_failure", {
//         ...meta,
//       });
//     },

//     duplicate: (eventId: string, meta?: Record<string, any>) => {
//       console.warn(`[WEBHOOK] Duplicate blocked: ${eventId}`, meta);
//       emit(SeverityNumber.WARN, "WARN", "webhook_duplicate_blocked", {
//         event_id: eventId,
//         ...meta,
//       });
//     },

//     processed: (event: string, meta?: Record<string, any>) => {
//       console.log(`[WEBHOOK] Processed: ${event}`, meta);
//       emit(SeverityNumber.INFO, "INFO", "webhook_processed", {
//         webhook_event: event,
//         ...meta,
//       });
//     },

//     failed: (event: string, error: any, meta?: Record<string, any>) => {
//       console.error(`[WEBHOOK] Failed: ${event}`, error, meta);
//       emit(SeverityNumber.ERROR, "ERROR", "webhook_failed", {
//         webhook_event: event,
//         error_message: error?.message || String(error),
//         error_stack: error?.stack,
//         ...meta,
//       });
//     },

//     // ─── Paystack Namespace ───────────────────────────────────────────────────
//     paystack: {
//       chargeSuccess: (
//         reference: string,
//         metadataType: string,
//         meta?: Record<string, any>,
//       ) => {
//         console.log(
//           `[WEBHOOK:PAYSTACK] charge.success | ref: ${reference} | type: ${metadataType}`,
//         );
//         emit(SeverityNumber.INFO, "INFO", "paystack_charge_success", {
//           reference,
//           metadata_type: metadataType,
//           ...meta,
//         });
//       },

//       onboardingQueued: (intentId: string, reference: string) => {
//         console.log(
//           `[WEBHOOK:PAYSTACK] Onboarding queued | intentId: ${intentId}`,
//         );
//         emit(SeverityNumber.INFO, "INFO", "paystack_onboarding_queued", {
//           intent_id: intentId,
//           reference,
//         });
//       },

//       subscriptionFallback: (reference: string) => {
//         console.log(
//           `[WEBHOOK:PAYSTACK] Subscription fallback | ref: ${reference}`,
//         );
//         emit(SeverityNumber.INFO, "INFO", "paystack_subscription_fallback", {
//           reference,
//         });
//       },
//     },
//   },
// };

// export { loggerProvider };
// export default logger;

// import { PostHog } from "posthog-node";
// import dotenv from "dotenv";
// dotenv.config();

// const client = new PostHog(
//   process.env.POSTHOG_API_KEY || "phc_default_key_replace_me",
//   {
//     host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
//     flushAt: 20, // batch size before auto-flush
//     flushInterval: 10000, // flush every 10s (important for webhooks/short-lived jobs)
//   },
// );

// // Graceful shutdown — ensures buffered events are sent before process exits
// process.on("beforeExit", async () => {
//   await client.shutdown();
// });

// // ─── Distinct ID helper ───────────────────────────────────────────────────────
// // Uses a stable service identity so PostHog groups events by environment,
// // not a random session. For user-linked events, pass distinctId explicitly.
// const serviceId = `${process.env.SERVICE_NAME || "api"}-${process.env.NODE_ENV || "development"}`;

// // ─── PostHog capture helper ───────────────────────────────────────────────────
// function capture(
//   event: string,
//   properties: Record<string, any>,
//   distinctId: string = serviceId,
// ) {
//   try {
//     client.capture({
//       distinctId,
//       event,
//       properties: {
//         environment: process.env.NODE_ENV || "development",
//         service: process.env.SERVICE_NAME || "api",
//         timestamp: new Date().toISOString(),
//         ...properties,
//       },
//     });
//   } catch (e) {
//     console.error("[PostHog] Failed to capture event", e);
//   }
// }

// // ─── Logger ───────────────────────────────────────────────────────────────────
// const logger = {
//   error: (message: string, meta?: Record<string, any>) => {
//     console.error(`[ERROR] ${message}`, meta);
//     capture("server_error", {
//       level: "error",
//       message,
//       ...meta,
//     });
//   },

//   warn: (message: string, meta?: Record<string, any>) => {
//     console.warn(`[WARN] ${message}`, meta);
//     capture("server_warning", {
//       level: "warn",
//       message,
//       ...meta,
//     });
//   },

//   info: (message: string, meta?: Record<string, any>) => {
//     console.log(`[INFO] ${message}`, meta);
//     capture("server_info", {
//       level: "info",
//       message,
//       ...meta,
//     });
//   },

//   // ─── Webhook-specific methods ───────────────────────────────────────────────
//   webhook: {
//     received: (event: string, meta?: Record<string, any>) => {
//       console.log(`[WEBHOOK] Received: ${event}`, meta);
//       capture("webhook_received", {
//         webhook_event: event,
//         ...meta,
//       });
//     },

//     signatureFailure: (meta?: Record<string, any>) => {
//       console.error("[WEBHOOK] Invalid signature", meta);
//       capture("webhook_signature_failure", {
//         level: "error",
//         ...meta,
//       });
//     },

//     duplicate: (eventId: string, meta?: Record<string, any>) => {
//       console.warn(`[WEBHOOK] Duplicate blocked: ${eventId}`, meta);
//       capture("webhook_duplicate_blocked", {
//         level: "warn",
//         event_id: eventId,
//         ...meta,
//       });
//     },

//     processed: (event: string, meta?: Record<string, any>) => {
//       console.log(`[WEBHOOK] Processed: ${event}`, meta);
//       capture("webhook_processed", {
//         webhook_event: event,
//         ...meta,
//       });
//     },

//     failed: (event: string, error: any, meta?: Record<string, any>) => {
//       console.error(`[WEBHOOK] Failed: ${event}`, error, meta);
//       capture("webhook_failed", {
//         level: "error",
//         webhook_event: event,
//         error_message: error?.message || String(error),
//         error_stack: error?.stack,
//         ...meta,
//       });
//     },

//     // Paystack-specific
//     paystack: {
//       chargeSuccess: (
//         reference: string,
//         metadataType: string,
//         meta?: Record<string, any>,
//       ) => {
//         console.log(
//           `[WEBHOOK:PAYSTACK] charge.success | ref: ${reference} | type: ${metadataType}`,
//           meta,
//         );
//         capture("paystack_charge_success", {
//           reference,
//           metadata_type: metadataType,
//           ...meta,
//         });
//       },

//       onboardingQueued: (intentId: string, reference: string) => {
//         console.log(
//           `[WEBHOOK:PAYSTACK] Onboarding queued | intentId: ${intentId}`,
//         );
//         capture("paystack_onboarding_queued", {
//           intent_id: intentId,
//           reference,
//         });
//       },

//       subscriptionFallback: (reference: string) => {
//         console.log(
//           `[WEBHOOK:PAYSTACK] Subscription fallback | ref: ${reference}`,
//         );
//         capture("paystack_subscription_fallback", { reference });
//       },
//     },
//   },
// };

// export { client }; // export if you need to call client.shutdown() manually elsewhere
// export default logger;

// import { PostHog } from 'posthog-node';
// import dotenv from 'dotenv';
// dotenv.config();

// const client = new PostHog(
//   process.env.POSTHOG_API_KEY || 'phc_default_key_replace_me',
//   { host: process.env.POSTHOG_HOST || 'https://app.posthog.com' }
// );

// const logger = {
//   error: (message: string, meta?: any) => {
//     console.error(`[ERROR] ${message}`, meta);
//     try {
//       client.capture({
//         distinctId: process.env.NODE_ENV || 'development',
//         event: 'server_error',
//         properties: {
//           message,
//           ...meta
//         }
//       });
//     } catch (e) {
//       console.error('Failed to log to PostHog', e);
//     }
//   },
//   info: (message: string, meta?: any) => {
//     console.log(`[INFO] ${message}`, meta);
//   },
//   warn: (message: string, meta?: any) => {
//     console.warn(`[WARN] ${message}`, meta);
//   }
// };

// export default logger;
