import type { Request, Response } from "express";
import { prisma } from "@/infrastructure/prisma";
import logger from "@/infrastructure/logger/logger";
import { PaystackService } from "@/core/services/paystack.service";
import { WebhookProcessor } from "@/core/services/webhook-processor.service";

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

    let event: any;

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

    if (!event?.event || !event?.data?.id) {
      logger.webhook.signatureFailure({
        reason: "invalid_event_structure",
        payload: event,
      });
      return res.status(400).send("Invalid webhook structure");
    }

    logger.webhook.received(event.event, {
      event_id: event.data.id,
      metadata_type: event.data.metadata?.type,
    });

    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: event.data.id.toString() },
    });

    if (existingEvent) {
      logger.webhook.duplicate(event.data.id.toString(), {
        event_type: event.event,
      });
      return res.status(200).send("Event already processed");
    }

    await prisma.webhookEvent.create({
      data: {
        id: event.data.id.toString(),
        source: "PAYSTACK",
        type: event.event,
        payload: event,
      },
    });

    try {
      switch (event.event) {
        case "charge.success":
          await WebhookProcessor.handleChargeSuccess(event.data);
          break;
        case "transfer.success":
          await WebhookProcessor.handleTransferSuccess(event.data);
          break;
        case "transfer.failed":
          await WebhookProcessor.handleTransferFailed(event.data);
          break;
        case "transfer.reversed":
          await WebhookProcessor.handleTransferReversed(event.data);
          break;
        default:
          logger.webhook.received(event.event, { ignored: true });
          break;
      }

      await prisma.webhookEvent.update({
        where: { id: event.data.id.toString() },
        data: { processed: true },
      });

      logger.webhook.processed(event.event, {
        event_id: event.data.id,
        metadata_type: event.data.metadata?.type,
      });

      return res.status(200).send("Webhook Processed");
    } catch (error: any) {
      logger.webhook.failed(event.event, error, { event_id: event.data.id });
      return res.status(500).send("Internal Server Error during processing");
    }
  }
}
