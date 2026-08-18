import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
export * from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL!;

const pool = new pg.Pool({
  connectionString,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

const adapter = new PrismaPg(pool);

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// export const prisma = new PrismaClient({ adapter, log: ["error"] }).$extends({
//   result: {
//     $allModels: {
//       toJSON: {
//         compute(data) {
//           return () => {
//             const { id, ...rest } = data as any;
//             return rest;
//           };
//         },
//       },
//     },
//   },
// });

const basePrisma = new PrismaClient({
  adapter,
  log: ["error"],
});

export const prisma = basePrisma.$extends({
  result: {
    $allModels: {
      toJSON: {
        compute(data) {
          return () => {
            const { id, ...rest } = data as any;
            return rest;
          };
        },
      },
    },
  },
});

export type PrismaTxClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];
