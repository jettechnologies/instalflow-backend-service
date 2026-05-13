import swaggerJsdoc from "swagger-jsdoc";
import express, { Express, Request, Response, NextFunction } from "express";
import swaggerUiDist from "swagger-ui-dist";
import path from "path";

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
    } as any;
  }
})();

export function setupSwagger(app: Express): void {
  const uiAssetsPath = swaggerUiDist.getAbsoluteFSPath();

  // 1. swagger.json — dynamic scheme/host from request
  app.get("/api-docs/swagger.json", (req: Request, res: Response) => {
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
  app.get("/api-docs/swagger-ui-init.js", (_req: Request, res: Response) => {
    res.type("application/javascript").send(`
        window.onload = function() {
          window.ui = SwaggerUIBundle({
            url: "/api-docs/swagger.json",
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
            plugins: [SwaggerUIBundle.plugins.DownloadUrl],
            layout: "StandaloneLayout",
            validatorUrl: null
          });
        };
    `);
  });

  // 3. Index HTML — inline, no sendFile, no fs dependency
  app.get("/api-docs", (_req: Request, res: Response) => {
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

  console.log(
    "Swagger Path:",
    path.join(process.cwd(), "docs/swagger/**/*.yaml"),
  );

  // 4. Static assets — serves css, js, icons from swagger-ui-dist
  app.use("/api-docs", express.static(uiAssetsPath));
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
