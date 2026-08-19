import swaggerJsdoc from "swagger-jsdoc";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import swaggerUiDist from "swagger-ui-dist";
import path from "path";
import crypto from "crypto";

const isProd = process.env.NODE_ENV === "production";
const isStaging = process.env.NODE_ENV === "staging";
const isProtected = isProd || isStaging;

const swaggerApiKey = process.env.SWAGGER_API_KEY;
const swaggerAdminEmail = process.env.SWAGGER_ADMIN_EMAIL;
const swaggerAdminPassword = process.env.SWAGGER_ADMIN_PASSWORD;

const swaggerAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!isProtected) return next();

  if (!swaggerApiKey && !(swaggerAdminEmail && swaggerAdminPassword)) {
    return res.status(404).json({ error: "Not found" });
  }

  if (req.path === "/api-docs/login" && req.method === "GET") return next();
  if (req.path === "/api-docs/login" && req.method === "POST") return next();

  const token =
    (req.query.token as string | undefined) ||
    (req.headers["x-swagger-token"] as string | undefined);

  if (swaggerApiKey && token === swaggerApiKey) return next();

  const sessionValue = req.signedCookies?.swagger_session;
  if (typeof sessionValue === "string" && sessionValue.length > 0) return next();

  if (req.accepts("html")) {
    return res.redirect("/api-docs/login");
  }

  return res.status(401).json({ error: "Unauthorized" });
};

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Instalflow Platform API",
      version: "1.0.0",
      description:
        "API documentation for the Instalflow B2B/B2C core service engine.",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter Access Token as: **Bearer <token>**",
        },
      },
    },
  },
  // apis: ["./docs/swagger/**/*.yaml"],
  apis: [path.join(process.cwd(), "docs/swagger/**/*.yaml")],
};

export const swaggerSpec = (() => {
  try {
    return swaggerJsdoc(options);
  } catch (err) {
    console.error("[swagger] swagger-jsdoc failed:", err);
    if (err instanceof Error) console.error("[swagger] detail:", err.message);
    return {
      openapi: "3.0.0",
      info: { title: "Instalflow Platform API (partial)", version: "0.0.0" },
      paths: {},
    } as swaggerJsdoc.OAS3Definition;
  }
})();

export function setupSwagger(app: Express): void {
  const uiAssetsPath = swaggerUiDist.getAbsoluteFSPath();

  if (isProtected && swaggerAdminEmail && swaggerAdminPassword) {
    app.get("/api-docs/login", (req: Request, res: Response) => {
      const existing = req.signedCookies?.swagger_session;
      if (typeof existing === "string" && existing.length > 0) {
        return res.redirect("/api-docs");
      }

      res.type("text/html").send(`<!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Instalflow API Docs — Login</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0B0F1A; color: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            form { background: #111827; border: 1px solid #1F2937; border-radius: 16px; padding: 2.5rem; width: 100%; max-width: 360px; }
            h1 { margin: 0 0 1.5rem; font-size: 1.25rem; text-align: center; }
            label { display: block; font-size: 0.875rem; color: #9CA3AF; margin-bottom: 0.5rem; }
            input { width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid #374151; background: #0B0F1A; color: #F9FAFB; font-size: 1rem; box-sizing: border-box; margin-bottom: 1rem; }
            button { width: 100%; padding: 0.75rem; border-radius: 8px; border: none; background: #7C3AED; color: white; font-size: 1rem; cursor: pointer; }
            button:hover { background: #6D28D9; }
            .error { color: #EF4444; font-size: 0.875rem; margin-top: 1rem; text-align: center; }
          </style>
        </head>
        <body>
          <form method="POST" action="/api-docs/login">
            <h1>API Documentation</h1>
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required autofocus />
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required />
            <button type="submit">Sign in</button>
            ${req.query.error ? '<div class="error">Invalid credentials</div>' : ''}
          </form>
        </body>
        </html>`);
    });

    app.post("/api-docs/login", (req: Request, res: Response) => {
      const { email, password } = req.body as { email?: string; password?: string };

      if (
        email === swaggerAdminEmail &&
        password === swaggerAdminPassword
      ) {
        const sessionToken = crypto.randomBytes(32).toString("hex");
        res.cookie("swagger_session", sessionToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: "strict",
          signed: true,
          maxAge: 8 * 60 * 60 * 1000,
        });
        return res.redirect("/api-docs");
      }

      res.redirect("/api-docs/login?error=1");
    });

    app.post("/api-docs/logout", (req: Request, res: Response) => {
      res.clearCookie("swagger_session");
      res.redirect("/api-docs/login");
    });
  }

  // 1. swagger.json — dynamic scheme/host from request
  app.get("/api-docs/swagger.json", swaggerAuth, (req: Request, res: Response) => {
    const scheme =
      (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    const host =
      (req.headers["x-forwarded-host"] as string) ||
      req.headers.host ||
      "localhost";

    res.json({
      ...swaggerSpec,
      servers: [
        {
          url: `${scheme}://${host}/api/v1`,
          description: "Current server",
        },
        {
          url: "http://localhost:3000/api/v1",
          description: "Development core server",
        },
        {
          url: "https://instalflow-backend-6kiz.onrender.com/api/v1",
          description: "Production server",
        },
      ],
    });
  });

  // 2. Custom init script — points UI to local swagger.json
  app.get("/api-docs/swagger-ui-init.js", swaggerAuth, (_req: Request, res: Response) => {
    res.type("application/javascript").send(`
        window.onload = function() {
          window.ui = SwaggerUIBundle({
            url: "/api-docs/swagger.json",
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
            plugins: [SwaggerUIBundle.plugins.DownloadUrl],
            layout: "StandaloneLayout",
            validatorUrl: null,
            requestInterceptor: (req) => {
              req.credentials = "include";
              return req;
            },
          });
        };
    `);
  });

  // 3. Index HTML — inline, no sendFile, no fs dependency
  app.get("/api-docs", swaggerAuth, (_req: Request, res: Response) => {
    res.type("text/html").send(`<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Instalflow Platform API</title>
        <link rel="stylesheet" href="/api-docs/swagger-ui.css">
        <link rel="icon" type="image/png" href="/api-docs/favicon-32x32.png" sizes="32x32">
        <link rel="icon" type="image/png" href="/api-docs/favicon-16x16.png" sizes="16x16">
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="/api-docs/swagger-ui-bundle.js"></script>
        <script src="/api-docs/swagger-ui-standalone-preset.js"></script>
        <script src="/api-docs/swagger-ui-init.js"></script>
      </body>
      </html>`);
  });

  // console.log(
  //   "Swagger Path:",
  //   path.join(process.cwd(), "docs/swagger/**/*.yaml"),
  // );

  // 4. Static assets — serves css, js, icons from swagger-ui-dist
  app.use("/api-docs", swaggerAuth, express.static(uiAssetsPath));
}

// previous version with swagger-ui-express (had issues with dynamic servers and CSP in production)

// import swaggerJsdoc from "swagger-jsdoc";
// import swaggerUi from "swagger-ui-express";
// import { Express } from "express";

// const options: swaggerJsdoc.Options = {
//   definition: {
//     openapi: "3.0.0",
//     info: {
//       title: "Instalflow Platform API",
//       version: "1.0.0",
//       description:
//         "API documentation for the Instalflow B2B/B2C core service engine.",
//     },
//     servers: [
//       {
//         url: "http://localhost:3000/api/v1",
//         description: "Development core server",
//       },
//       {
//         url: "https://instalflow-backend-6kiz.onrender.com/api/v1",
//         description: "Production server",
//       },
//     ],
//     components: {
//       securitySchemes: {
//         bearerAuth: {
//           type: "http",
//           scheme: "bearer",
//           bearerFormat: "JWT",
//           description: "Enter Access Token as: **Bearer <token>**",
//         },
//       },
//     },
//   },
//   // Following Architecture Guide #7: Decoupled API Documentation
//   apis: ["./docs/swagger/**/*.yaml"],
// };

// export const swaggerSpec = swaggerJsdoc(options);

// export function setupSwagger(app: Express): void {
//   app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// }
