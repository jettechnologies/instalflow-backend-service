// src/api/index.ts — API Runtime Entrypoint
// This process serves HTTP requests ONLY. No BullMQ workers or schedulers.

import express from "express";
import cors from "cors";
import "@/infrastructure/config/validate-env";
import { configureExpress } from "@/infrastructure/config/express";
import { setupSwagger } from "@/infrastructure/config/swagger";
import "@/infrastructure/logger/instruments";
import logger from "@/infrastructure/logger/logger";
import "@/core/events/handlers/notification.handler";
import router from "@/api/routes";
import webhookRoutes from "@/api/routes/webhook.routes";
import { errorHandler } from "@/api/middlewares/errorHandler";
import csrfMiddleware from "./middlewares/csrf-middlewares";
import { ForbiddenError } from "@/shared/utils/AppError";

const app = express();

// Webhook routes need raw body parsing — mount BEFORE express.json()
app.use(
  "/api/v1/webhooks",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

configureExpress(app);
setupSwagger(app);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""));

app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, cb) => {
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new ForbiddenError("Origin not allowed by CORS policy"));
    },
    credentials: true,
  }),
);

// setting csrfMiddleware after cors
app.use(csrfMiddleware);

// Mount primary domain routers
app.use("/api/v1", router);

// Catch all errors propagating out of routes natively
app.use(errorHandler as unknown as express.RequestHandler);

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`🚀 API Server Live on port ${PORT}`);
});
