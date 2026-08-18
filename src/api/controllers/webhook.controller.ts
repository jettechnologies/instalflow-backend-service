import type { Request, Response } from "express";
import { prisma, type Prisma } from "@/infrastructure/prisma";
import logger from "@/infrastructure/logger/logger";
import { PaystackService } from "@/core/services/paystack.service";
import { WebhookProcessor } from "@/core/services/webhook-processor.service";

type PaystackWebhookEvent = {
  event: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
};

export class WebhookController {
  static async handlePaystack(req: Request, res: Response) {
    const signature = req.headers["x-paystack-signature"] as string;

    if (!signature) {
      logger.webhook.signatureFailure({ reason: "missing_signature_header" });
      return res.status(400).send("Missing signature");
    }

    let rawBody: string;

    try {
      if (Buffer.isBuffer(req.body)) {
        rawBody = req.body.toString("utf8");
      } else if (typeof req.body === "string") {
        rawBody = req.body;
      } else if (typeof req.body === "object" && req.body !== null) {
        rawBody = JSON.stringify(req.body);
      } else {
        logger.webhook.signatureFailure({ reason: "unparseable_body" });
        return res.status(400).send("Invalid body");
      }
    } catch (error) {
      logger.webhook.signatureFailure({
        reason: "body_normalization_failed",
        error,
      });
      return res.status(400).send("Invalid payload");
    }

    const isValid = PaystackService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      logger.webhook.signatureFailure({
        reason: "invalid_signature",
        received: signature,
      });
      return res.status(400).send("Invalid signature");
    }

    let event: PaystackWebhookEvent;

    try {
      if (Buffer.isBuffer(req.body)) {
        event = JSON.parse(req.body.toString("utf8"));
      } else if (typeof req.body === "string") {
        event = JSON.parse(req.body);
      } else {
        event = req.body;
      }
    } catch (error) {
      logger.webhook.signatureFailure({ reason: "json_parse_failure", error });
      return res.status(400).send("Malformed JSON");
    }

    const eventData = event as Record<string, unknown>;

    if (!event?.event || !(eventData.data as Record<string, unknown>)?.id) {
      logger.webhook.signatureFailure({
        reason: "invalid_event_structure",
        payload: event,
      });
      return res.status(400).send("Invalid webhook structure");
    }

    const dataRecord = eventData.data as Record<string, unknown>;

    logger.webhook.received(event.event, {
      event_id: (dataRecord.id as string).toString(),
      metadata_type: (
        dataRecord.metadata as Record<string, unknown> | undefined
      )?.type,
    });

    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: (dataRecord.id as string).toString() },
    });

    if (existingEvent) {
      logger.webhook.duplicate((dataRecord.id as string).toString(), {
        event_type: event.event,
      });
      return res.status(200).send("Event already processed");
    }

    await prisma.webhookEvent.create({
      data: {
        id: (dataRecord.id as string).toString(),
        source: "PAYSTACK",
        type: event.event,
        payload: event as Prisma.InputJsonValue,
      },
    });

    try {
      switch (event.event) {
        case "charge.success":
          await WebhookProcessor.handleChargeSuccess(dataRecord);
          break;
        case "transfer.success":
          await WebhookProcessor.handleTransferSuccess(dataRecord);
          break;
        case "transfer.failed":
          await WebhookProcessor.handleTransferFailed(dataRecord);
          break;
        case "transfer.reversed":
          await WebhookProcessor.handleTransferReversed(dataRecord);
          break;
        default:
          logger.webhook.received(event.event, { ignored: true });
          break;
      }

      await prisma.webhookEvent.update({
        where: { id: (dataRecord.id as string).toString() },
        data: { processed: true },
      });

      logger.webhook.processed(event.event, {
        event_id: dataRecord.id as string,
        metadata_type: (
          dataRecord.metadata as Record<string, unknown> | undefined
        )?.type,
      });

      return res.status(200).send("Webhook Processed");
    } catch (error: unknown) {
      logger.webhook.failed(event.event, error, {
        event_id: eventData.id as string,
      });
      return res.status(500).send("Internal Server Error during processing");
    }
  }
}
