import type { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "@/prisma/client.js";
import logger from "../libs/logger";
import { AuthService } from "../services/auth.service";
import { SubscriptionService } from "../services/subscription.service";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";

export class WebhookController {
  /**
   * Main entry point for Paystack Webhooks
   */
  static async handlePaystack(req: Request, res: Response) {
    const signature = req.headers["x-paystack-signature"] as string;

    // 1. Verify HMAC Signature
    const hash = crypto
      .createHmac("sha256", PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      logger.error("Invalid Paystack Signature received");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    logger.info(`Received Paystack Webhook: ${event.event}`);

    // 2. Idempotency: Check if we already processed this event
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: event.data.id.toString() },
    });

    if (existingEvent) {
      return res.status(200).send("Event already processed");
    }

    // 3. Log the event
    await prisma.webhookEvent.create({
      data: {
        id: event.data.id.toString(),
        source: "PAYSTACK",
        type: event.event,
        payload: event.data,
      },
    });

    // 4. Handle Specific Events
    try {
      if (event.event === "charge.success") {
        await WebhookController.handleChargeSuccess(event.data);
      }

      // Update event as processed
      await prisma.webhookEvent.update({
        where: { id: event.data.id.toString() },
        data: { processed: true },
      });

      return res.status(200).send("Webhook Processed");
    } catch (error: any) {
      logger.error(`Webhook Processing Error (${event.event}):`, error);
      return res.status(500).send("Internal Server Error during processing");
    }
  }

  /**
   * Handle successful payment
   */
  private static async handleChargeSuccess(data: any) {
    const reference = data.reference;

    // A. Check if this is a Pending Onboarding
    const pending = await prisma.pendingOnboarding.findUnique({
      where: { paymentReference: reference },
    });

    if (pending && pending.status === "PENDING") {
      logger.info(`Auto-Onboarding triggered for reference: ${reference}`);

      // Execute onboarding (This will create Company, Admin, Sub, and Ledger)
      await AuthService.onboardCompany(
        {
          email: pending.email,
          password: "", // Not needed for internal call or use special flag
          companyName: pending.companyName,
          adminName: pending.adminName,
          planId: pending.planId,
          paymentReference: reference,
        },
        true,
      ); // Pass a flag to skip password hashing/checking if needed

      await prisma.pendingOnboarding.update({
        where: { id: pending.id },
        data: { status: "COMPLETED" },
      });

      return;
    }

    if (pending && pending.status === "COMPLETED") {
      logger.info(`Already onboarded for reference: ${reference}`);
      return;
    }

    // B. Check if this is an existing subscription renewal/payment
    // If it's not pending onboarding, it might be a normal subscription verification
    // This part would usually be handled by SubscriptionService.verifySubscription
    // but we can trigger it here for async safety.
    logger.info(`Processing standard payment for reference: ${reference}`);
    await SubscriptionService.verifySubscription(reference);
  }
}
