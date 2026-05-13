// ...existing code...
import swaggerJsdoc from "swagger-jsdoc";
// import swaggerUi from "swagger-ui-express";
import express, { Express } from "express";
import path from "path";
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
    servers: [
      {
        url: "http://localhost:3000/api/v1",
        description: "Development core server",
      },
      {
        url: "https://instalflow-backend-6kiz.onrender.com/api/v1",
        description: "Production server",
      },
    ],
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
  // Following Architecture Guide #7: Decoupled API Documentation
  apis: ["./docs/swagger/**/*.yaml"],
};

export const swaggerSpec = swaggerJsdoc(options);

// export function setupSwagger(app: Express): void {
//   // Serve swagger-ui-dist assets from the same origin/protocol
//   const uiAssetsPath = swaggerUiDist.getAbsoluteFSPath();

//   // Static assets (css, bundle js, presets, favicon, etc.)
//   app.use("/api-docs", express.static(uiAssetsPath));

//   // Serve the generated OpenAPI JSON
//   app.get("/api-docs/swagger.json", (_req, res) => {
//     res.json(swaggerSpec);
//   });

//   // Provide a small initializer script that points the UI to the local swagger.json
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

//   // Serve the index.html from swagger-ui-dist (it references ./swagger-ui-bundle.js etc)
//   app.get("/api-docs", (_req, res) => {
//     res.sendFile(path.join(uiAssetsPath, "index.html"));
//   });
// }

export function setupSwagger(app: Express): void {
  const uiAssetsPath = swaggerUiDist.getAbsoluteFSPath();

  // 1. Custom routes FIRST (before static middleware intercepts them)
  app.get("/api-docs", (_req, res) => {
    res.sendFile(path.join(uiAssetsPath, "index.html"));
  });

  app.get("/api-docs/swagger.json", (_req, res) => {
    res.json(swaggerSpec);
  });

  app.get("/api-docs/swagger-ui-init.js", (_req, res) => {
    res.type("application/javascript").send(`
window.onload = function() {
  const ui = SwaggerUIBundle({
    url: "/api-docs/swagger.json",
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  });
  window.ui = ui;
};
    `);
  });

  // 2. Static assets AFTER custom routes
  app.use("/api-docs", express.static(uiAssetsPath));
}

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
