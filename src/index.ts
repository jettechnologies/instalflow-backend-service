import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { configureExpress } from "./config/express";
import { setupSwagger } from "./config/swagger";
import "@/libs/instruments";
import webhookRoutes from "./routes/webhook.routes";
// import { httpServerHandler } from "cloudflare:node";

const app = express();

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
app.listen(PORT, () => console.log(`Server Live on port ${PORT} 🚀`));

// export default httpServerHandler({ port: PORT });
