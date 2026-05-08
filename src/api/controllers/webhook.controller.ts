import type { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "@/infrastructure/prisma";
import logger from "@/infrastructure/logger/logger";
import { AuthService } from "@/core/services/auth.service";
import { SubscriptionService } from "@/core/services/subscription.service";
import { onboardingQueue } from "@/infrastructure/queues/onboarding.queue";
import { PaystackService } from "@/core/services/paystack.service";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";

export class WebhookController {
  static async handlePaystack(req: Request, res: Response) {
    const signature = req.headers["x-paystack-signature"] as string;

    // ─────────────────────────────────────────────────────────────
    // 1. Validate Signature Header
    // ─────────────────────────────────────────────────────────────
    if (!signature) {
      logger.webhook.signatureFailure({
        reason: "missing_signature_header",
      });

      return res.status(400).send("Missing signature");
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Normalize Raw Body
    // ─────────────────────────────────────────────────────────────
    let rawBody: string;

    try {
      if (Buffer.isBuffer(req.body)) {
        // express.raw()
        rawBody = req.body.toString("utf8");
      } else if (typeof req.body === "string") {
        // express.text()
        rawBody = req.body;
      } else if (typeof req.body === "object" && req.body !== null) {
        // express.json()
        rawBody = JSON.stringify(req.body);
      } else {
        logger.webhook.signatureFailure({
          reason: "unparseable_body",
        });

        return res.status(400).send("Invalid body");
      }
    } catch (error) {
      logger.webhook.signatureFailure({
        reason: "body_normalization_failed",
        error,
      });

      return res.status(400).send("Invalid payload");
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Verify Webhook Signature
    // ─────────────────────────────────────────────────────────────
    const isValid = PaystackService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      logger.webhook.signatureFailure({
        reason: "invalid_signature",
        received: signature,
      });

      return res.status(400).send("Invalid signature");
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Parse Webhook Event Safely
    // ─────────────────────────────────────────────────────────────
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
      logger.webhook.signatureFailure({
        reason: "json_parse_failure",
        error,
      });

      return res.status(400).send("Malformed JSON");
    }

    // ─────────────────────────────────────────────────────────────
    // 5. Validate Webhook Structure
    // ─────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────
    // 6. Idempotency Check
    // ─────────────────────────────────────────────────────────────
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: {
        id: event.data.id.toString(),
      },
    });

    if (existingEvent) {
      logger.webhook.duplicate(event.data.id.toString(), {
        event_type: event.event,
      });

      return res.status(200).send("Event already processed");
    }

    // ─────────────────────────────────────────────────────────────
    // 7. Persist Webhook Event
    // ─────────────────────────────────────────────────────────────
    await prisma.webhookEvent.create({
      data: {
        id: event.data.id.toString(),
        source: "PAYSTACK",
        type: event.event,
        payload: event, // store full payload
      },
    });

    // ─────────────────────────────────────────────────────────────
    // 8. Process Webhook Event
    // ─────────────────────────────────────────────────────────────
    try {
      switch (event.event) {
        case "charge.success":
          await WebhookController.handleChargeSuccess(event.data);
          break;

        default:
          logger.webhook.received(event.event, {
            ignored: true,
          });
          break;
      }

      // Mark webhook as processed
      await prisma.webhookEvent.update({
        where: {
          id: event.data.id.toString(),
        },
        data: {
          processed: true,
        },
      });

      logger.webhook.processed(event.event, {
        event_id: event.data.id,
        metadata_type: event.data.metadata?.type,
      });

      return res.status(200).send("Webhook Processed");
    } catch (error: any) {
      logger.webhook.failed(event.event, error, {
        event_id: event.data.id,
      });

      return res.status(500).send("Internal Server Error during processing");
    }
  }

  private static async handleChargeSuccess(data: any) {
    const reference = data.reference;
    const metadataType = data.metadata?.type;

    logger.webhook.paystack.chargeSuccess(reference, metadataType, {
      intent_id: data.metadata?.intentId,
    });

    switch (metadataType) {
      case "onboarding": {
        const intent = await prisma.onboardingIntent.findFirst({
          where: { paymentReference: reference },
        });

        if (!intent) {
          logger.error("No intent found for reference", { reference });
          return;
        }

        if (intent.status === "COMPLETED") return;

        await prisma.onboardingIntent.update({
          where: { id: intent.id },
          data: { status: "PAID" },
        });

        await onboardingQueue.add(
          "process-onboarding",
          { intentId: intent.intentId, reference },
          {
            jobId: intent.intentId,
            attempts: 5,
            backoff: { type: "exponential", delay: 60000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        logger.webhook.paystack.onboardingQueued(intent.intentId, reference);
        return;
      }

      default:
        logger.webhook.paystack.subscriptionFallback(reference);
        await SubscriptionService.verifySubscription(reference);
    }
  }
}
