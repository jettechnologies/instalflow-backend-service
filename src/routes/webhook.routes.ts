// routes/webhook.routes.ts
import { Router } from "express";
import { WebhookController } from "@/controllers/webhook.controller";

const webhookRoutes = Router();

webhookRoutes.post("/paystack", WebhookController.handlePaystack);

export default webhookRoutes;
