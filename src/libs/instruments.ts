// instrumentation.ts — must be imported FIRST before anything else in your entry point
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import dotenv from "dotenv";
dotenv.config();

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": process.env.SERVICE_NAME || "api",
    "service.environment": process.env.NODE_ENV || "development",
    "service.version": process.env.npm_package_version || "1.0.0",
  }),
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: `${process.env.POSTHOG_HOST || "https://us.i.posthog.com"}/i/v1/logs`,
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`,
      },
    }),
    {
      maxExportBatchSize: 50,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
      maxQueueSize: 2048,
    },
  ),
});

sdk.start();

// Flush + shutdown on graceful exit
async function shutdownTelemetry() {
  try {
    await sdk.shutdown();
    console.log("[OTel] SDK shut down successfully");
  } catch (e) {
    console.error("[OTel] Error shutting down SDK", e);
  }
}

process.on("SIGTERM", shutdownTelemetry);
process.on("SIGINT", shutdownTelemetry);
process.on("beforeExit", shutdownTelemetry);

export { sdk, shutdownTelemetry };
