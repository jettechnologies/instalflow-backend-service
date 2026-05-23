import express, { Application } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import session from "express-session";
import PrismaSessionStore from "@/shared/utils/prisma-session-store";
import sanitizer from "@/shared/utils/sanitizer";
import csrfMiddleware from "@/api/middlewares/csrf-middlewares";
import dotenv from "dotenv";

dotenv.config();

export function configureExpress(app: Application): void {
  app.use(helmet());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(sanitizer);

  app.set("trust proxy", 1);

  app.use("/api-docs", (req, res, next) => {
    // Remove helmet's CSP and set a permissive one for swagger
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        // Critical: do NOT include upgrade-insecure-requests
      ].join("; "),
    );
    next();
  });

  app.use(
    session({
      store: new PrismaSessionStore(60 * 60 * 24),
      secret: process.env.SESSION_SECRET || "defaultsecret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
      },
    }),
  );

  app.use(csrfMiddleware);
}
