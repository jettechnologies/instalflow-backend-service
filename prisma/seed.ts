import { prisma } from "./client.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function generateSeedPassword(): string {
  const random = crypto
    .randomBytes(18)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 20);
  return `IFL_SUP_${random}!1`;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    console.log(
      "⏭️  Skipping seed: NODE_ENV=production and ALLOW_PROD_SEED is not set to \"true\". " +
        "Seeding is a manual, one-time operation in production — run it explicitly with ALLOW_PROD_SEED=true if you really need to.",
    );
    return;
  }

  const email = process.env.SUPER_ADMIN_SEED_EMAIL ?? "superadmin@example.com";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("✅ Super Admin already exists, skipping:", email);
    return;
  }

  const tempPassword = process.env.SUPER_ADMIN_SEED_PASSWORD ?? generateSeedPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  const superAdmin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: "Super Admin",
      role: "SUPER_ADMIN",
      forcePasswordChange: true,
    },
  });

  console.log("✅ Seeded Super Admin:", superAdmin.email);
  if (!process.env.SUPER_ADMIN_SEED_PASSWORD) {
    console.log(
      "   Generated one-time password (record this now, it will not be shown again):",
      tempPassword,
    );
  }
  console.log("   forcePasswordChange is set — this password must be changed on first login.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
