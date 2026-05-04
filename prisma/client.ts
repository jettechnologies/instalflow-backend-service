import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
export * from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.DATABASE_URL!;

const adapter = isProduction
  ? new PrismaNeon({ connectionString })
  : new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter }).$extends({
  result: {
    product: { id: { needs: {}, compute: () => undefined } },
    user: { id: { needs: {}, compute: () => undefined } },
    company: { id: { needs: {}, compute: () => undefined } },
    category: { id: { needs: {}, compute: () => undefined } },
    productVariant: { id: { needs: {}, compute: () => undefined } },
    application: { id: { needs: {}, compute: () => undefined } },
    installment: { id: { needs: {}, compute: () => undefined } },
    payment: { id: { needs: {}, compute: () => undefined } },
    commission: { id: { needs: {}, compute: () => undefined } },
    ledgerTransaction: { id: { needs: {}, compute: () => undefined } },
    referral: { id: { needs: {}, compute: () => undefined } },
    userSession: { id: { needs: {}, compute: () => undefined } },
    subscriptionPlan: { id: { needs: {}, compute: () => undefined } },
    companySubscription: { id: { needs: {}, compute: () => undefined } },
    passwordReset: { id: { needs: {}, compute: () => undefined } },
    session: { id: { needs: {}, compute: () => undefined } },
    ledgerAccount: { id: { needs: {}, compute: () => undefined } },
    financialTransaction: { id: { needs: {}, compute: () => undefined } },
    journalEntry: { id: { needs: {}, compute: () => undefined } },
    webhookEvent: { id: { needs: {}, compute: () => undefined } },
    pendingOnboarding: { id: { needs: {}, compute: () => undefined } },
  },
});
