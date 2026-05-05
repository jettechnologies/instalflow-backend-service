import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

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

export function setupSwagger(app: Express): void {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
