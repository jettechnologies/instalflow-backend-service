// making use of csrf token hash instead
import type { Request, Response } from "express";
import logger from "@/infrastructure/logger/logger";
import { createCsrfToken, hashToken } from "@/shared/utils/helpers/csrf.helper";

export class CsrfController {
  static async generateToken(req: Request, res: Response) {
    try {
      const rawToken = createCsrfToken();
      const hashed = hashToken(rawToken);

      const cookieOptions = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 3 * 24 * 60 * 60 * 1000,
      };

      res.cookie("csrf_hash", hashed, cookieOptions);

      return res.status(200).json({
        status: "success",

        csrfToken: rawToken,
      });
    } catch (error) {
      logger.error("CSRF generation failed", { error });
      return res.status(500).json({ error: "CSRF generation failed" });
    }
  }
}

// import type { Request, Response } from "express";
// import logger from "@/infrastructure/logger/logger";
// import { createCsrfToken, hashToken } from "@/shared/utils/helpers/csrf.helper";

// export class CsrfController {
//   static async generateToken(req: Request, res: Response) {
//     try {
//       const rawToken = createCsrfToken();
//       const hashed = hashToken(rawToken);

//       const cookieOptions = {
//         httpOnly: false,
//         sameSite: "lax" as const,
//         secure: process.env.NODE_ENV === "production",
//         path: "/",
//         maxAge: 3 * 24 * 60 * 60 * 1000,
//       };

//       res.cookie("csrf_token", rawToken, cookieOptions);

//       res.cookie("csrf_hash", hashed, {
//         ...cookieOptions,
//         httpOnly: true,
//       });

//       return res.status(200).json({
//         status: "success",
//         csrfToken: rawToken,
//       });
//     } catch (error) {
//       logger.error("CSRF generation failed", { error });
//       return res.status(500).json({ error: "CSRF generation failed" });
//     }
//   }
// }

// import type { Request, Response } from "express";
// import crypto from "crypto";
// import logger from "@/infrastructure/logger/logger";

// const TOKEN_SECRET = process.env.CSRF_SECRET || "must-set-csrf-secret-in-env";

// const createCsrfToken = (): string => crypto.randomBytes(32).toString("hex");

// const hashToken = (token: string): string =>
//   crypto.createHmac("sha256", TOKEN_SECRET).update(token).digest("hex");

// export class CsrfController {
//   /**
//    * GET /api/v1/csrf-token
//    * Explicitly generates and returns a CSRF token.
//    */
//   static async generateToken(req: Request, res: Response) {
//     try {
//       const rawToken = createCsrfToken();
//       const hashed = hashToken(rawToken);

//       // Store the HASH in a HttpOnly cookie (verification source)
//       res.cookie("csrf_hash", hashed, {
//         httpOnly: true,
//         sameSite: "lax",
//         secure: process.env.NODE_ENV === "production",
//         maxAge: 3 * 24 * 60 * 60 * 1000,
//       });

//       // Expose the RAW token via a readable cookie (client source)
//       res.cookie("csrf_token", rawToken, {
//         httpOnly: false,
//         sameSite: "lax",
//         secure: process.env.NODE_ENV === "production",
//         maxAge: 3 * 24 * 60 * 60 * 1000,
//       });

//       // Also attach to header for immediate use
//       res.setHeader("x-csrf-token", rawToken);

//       return res.status(200).json({
//         status: "success",
//         csrfToken: rawToken,
//         message:
//           "CSRF token generated successfully. Ensure you send it back in the 'x-csrf-token' header for state-changing requests.",
//       });
//     } catch (error) {
//       logger.error("Error generating CSRF token:", {
//         error,
//       });
//       return res
//         .status(500)
//         .json({ error: "Internal Server Error during CSRF token generation" });
//     }
//   }
// }
