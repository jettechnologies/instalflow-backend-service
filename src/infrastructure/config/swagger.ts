import swaggerJsdoc from "swagger-jsdoc";
import express, { Express, Request, Response, NextFunction } from "express";
import swaggerUiDist from "swagger-ui-dist";

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
  apis: ["./docs/swagger/**/*.yaml"],
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

  // 4. Static assets — serves css, js, icons from swagger-ui-dist
  app.use("/api-docs", express.static(uiAssetsPath));
}

// import swaggerJsdoc from "swagger-jsdoc";
// import express, { Express, Request, Response, NextFunction } from "express";
// import path from "path";
// import fs from "fs";
// import swaggerUiDist from "swagger-ui-dist";

// const options: swaggerJsdoc.Options = {
//   definition: {
//     openapi: "3.0.0",
//     info: {
//       title: "Instalflow Platform API",
//       version: "1.0.0",
//       description:
//         "API documentation for the Instalflow B2B/B2C core service engine.",
//     },
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
//   apis: ["./docs/swagger/**/*.yaml"],
// };

// export const swaggerSpec = (() => {
//   try {
//     return swaggerJsdoc(options);
//   } catch (err) {
//     console.error("[swagger] swagger-jsdoc failed:", err);
//     if (err instanceof Error) {
//       console.error("[swagger] Error detail:", err.message);
//     }
//     return {
//       openapi: "3.0.0",
//       info: { title: "Instalflow Platform API (partial)", version: "0.0.0" },
//       paths: {},
//     } as any;
//   }
// })();

// export function setupSwagger(app: Express): void {
//   let uiAssetsPath: string | null = null;

//   try {
//     uiAssetsPath = swaggerUiDist.getAbsoluteFSPath();
//   } catch (err) {
//     console.error("[swagger] swagger-ui-dist.getAbsoluteFSPath() failed:", err);
//   }

//   // 1. Serve swagger.json with dynamic scheme based on request
//   app.get("/api-docs/swagger.json", (req: Request, res: Response) => {
//     try {
//       // Detect scheme from nginx X-Forwarded-Proto header, fallback to request protocol
//       const scheme =
//         (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
//       const host =
//         (req.headers["x-forwarded-host"] as string) ||
//         req.headers.host ||
//         "localhost";

//       const dynamicSpec = {
//         ...swaggerSpec,
//         servers: [
//           {
//             url: `${scheme}://${host}/api/v1`,
//             description: "Current server",
//           },
//           {
//             url: "http://localhost:3000/api/v1",
//             description: "Development core server",
//           },
//           {
//             url: "https://instalflow-backend-6kiz.onrender.com/api/v1",
//             description: "Production server",
//           },
//         ],
//       };

//       res.json(dynamicSpec);
//     } catch (err) {
//       console.error("[swagger] failed to serve swagger.json:", err);
//       res.status(500).json({ error: "Failed to generate API spec" });
//     }
//   });

//   // 2. Custom init script
//   app.get("/api-docs/swagger-ui-init.js", (_req: Request, res: Response) => {
//     res.type("application/javascript").send(`
// window.onload = function() {
//   const ui = SwaggerUIBundle({
//     url: "/api-docs/swagger.json",
//     dom_id: '#swagger-ui',
//     presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
//     layout: "StandaloneLayout",
//     validatorUrl: null
//   });
//   window.ui = ui;
// };
//     `);
//   });

//   // 3. Serve index.html
//   app.get("/api-docs", (_req: Request, res: Response, next: NextFunction) => {
//     try {
//       if (uiAssetsPath) {
//         const indexPath = path.join(uiAssetsPath, "index.html");
//         if (fs.existsSync(indexPath)) {
//           return res.sendFile(indexPath);
//         }
//       }

//       // Fallback HTML
//       const fallback = `<!doctype html>
// <html lang="en">
// <head>
//   <meta charset="utf-8">
//   <title>Instalflow API Docs</title>
//   <link rel="stylesheet" href="/api-docs/swagger-ui.css">
// </head>
// <body>
//   <div id="swagger-ui"></div>
//   <script src="/api-docs/swagger-ui-bundle.js"></script>
//   <script src="/api-docs/swagger-ui-standalone-preset.js"></script>
//   <script src="/api-docs/swagger-ui-init.js"></script>
// </body>
// </html>`;

//       res.type("text/html").send(fallback);
//     } catch (err) {
//       console.error("[swagger] failed to serve /api-docs:", err);
//       next(err);
//     }
//   });

//   // 4. Static assets last
//   if (uiAssetsPath && fs.existsSync(uiAssetsPath)) {
//     app.use("/api-docs", express.static(uiAssetsPath));
//   } else {
//     console.warn(
//       "[swagger] swagger-ui-dist assets not found — using fallback HTML",
//     );
//   }
// }

// // ...existing code...
// import swaggerJsdoc from "swagger-jsdoc";
// // import swaggerUi from "swagger-ui-express";
// import express, { Express } from "express";
// import path from "path";
// import swaggerUiDist from "swagger-ui-dist";

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

// // export function setupSwagger(app: Express): void {
// //   // Serve swagger-ui-dist assets from the same origin/protocol
// //   const uiAssetsPath = swaggerUiDist.getAbsoluteFSPath();

// //   // Static assets (css, bundle js, presets, favicon, etc.)
// //   app.use("/api-docs", express.static(uiAssetsPath));

// //   // Serve the generated OpenAPI JSON
// //   app.get("/api-docs/swagger.json", (_req, res) => {
// //     res.json(swaggerSpec);
// //   });

// //   // Provide a small initializer script that points the UI to the local swagger.json
// //   app.get("/api-docs/swagger-ui-init.js", (_req, res) => {
// //     res.type("application/javascript").send(`
// // window.onload = function() {
// //   const ui = SwaggerUIBundle({
// //     url: "/api-docs/swagger.json",
// //     dom_id: '#swagger-ui',
// //     presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
// //     layout: "StandaloneLayout"
// //   });
// //   window.ui = ui;
// // };
// //     `);
// //   });

// //   // Serve the index.html from swagger-ui-dist (it references ./swagger-ui-bundle.js etc)
// //   app.get("/api-docs", (_req, res) => {
// //     res.sendFile(path.join(uiAssetsPath, "index.html"));
// //   });
// // }

// export function setupSwagger(app: Express): void {
//   const uiAssetsPath = swaggerUiDist.getAbsoluteFSPath();

//   // 1. Custom routes FIRST (before static middleware intercepts them)
//   app.get("/api-docs", (_req, res) => {
//     res.sendFile(path.join(uiAssetsPath, "index.html"));
//   });

//   app.get("/api-docs/swagger.json", (_req, res) => {
//     res.json(swaggerSpec);
//   });

//   app.get("/api-docs/swagger-ui-init.js", (_req, res) => {
//     res.type("application/javascript").send(`
// window.onload = function() {
//   const ui = SwaggerUIBundle({
//     url: "/api-docs/swagger.json",
//     dom_id: '#swagger-ui',
//     presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
//     layout: "StandaloneLayout"
//   });
//   window.ui = ui;
// };
//     `);
//   });

//   // 2. Static assets AFTER custom routes
//   app.use("/api-docs", express.static(uiAssetsPath));
// }

// ...existing code...

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
