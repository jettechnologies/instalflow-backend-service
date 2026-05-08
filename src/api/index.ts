// src/api/index.ts — API Runtime Entrypoint
// This process serves HTTP requests ONLY. No BullMQ workers or schedulers.

import express from "express";
import cors from "cors";
import { configureExpress } from "@/infrastructure/config/express";
import { setupSwagger } from "@/infrastructure/config/swagger";
import "@/infrastructure/logger/instruments";
import router from "@/api/routes";
import webhookRoutes from "@/api/routes/webhook.routes";
import { errorHandler } from "@/api/middlewares/errorHandler";

const app = express();

// Webhook routes need raw body parsing — mount BEFORE express.json()
app.use(
  "/api/v1/webhooks",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

configureExpress(app);
setupSwagger(app);
app.use(cors());

// Mount primary domain routers
app.use("/api/v1", router);

// Catch all errors propagating out of routes natively
app.use(errorHandler as any);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API Server Live on port ${PORT}`));
