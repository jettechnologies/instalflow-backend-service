import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter }).$extends({
  result: {
    product: { id: { needs: {}, compute: () => undefined } },
    user: { id: { needs: {}, compute: () => undefined } },
    company: { id: { needs: {}, compute: () => undefined } },
    application: { id: { needs: {}, compute: () => undefined } },
    installment: { id: { needs: {}, compute: () => undefined } },
    payment: { id: { needs: {}, compute: () => undefined } },
    commission: { id: { needs: {}, compute: () => undefined } },
    ledgerTransaction: { id: { needs: {}, compute: () => undefined } },
    referral: { id: { needs: {}, compute: () => undefined } },
    userSession: { id: { needs: {}, compute: () => undefined } },
    subscriptionPlan: { id: { needs: {}, compute: () => undefined } },
    companySubscription: { id: { needs: {}, compute: () => undefined } },
  },
});
