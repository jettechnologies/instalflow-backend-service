import { prisma } from "../../src/infrastructure/prisma";

async function cleanInstallments() {
  const duplicates = await prisma.$queryRaw<
    Array<{ financingContractId: string; sequence: number }>
  >`
    SELECT "financingContractId", "sequence"
    FROM "Installment"
    GROUP BY "financingContractId", "sequence"
    HAVING COUNT(*) > 1
  `;

  for (const dup of duplicates) {
    const records = await prisma.installment.findMany({
      where: {
        financingContractId: dup.financingContractId,
        sequence: dup.sequence,
      },
      orderBy: { createdAt: "desc" },
    });

    const [keep, ...remove] = records;

    await prisma.installment.deleteMany({
      where: {
        id: { in: remove.map((r: any) => r.id) },
      },
    });
  }
}

async function cleanPayments() {
  const duplicates = await prisma.$queryRaw<
    Array<{ providerReference: string }>
  >`
    SELECT "providerReference"
    FROM "Payment"
    WHERE "providerReference" IS NOT NULL
    GROUP BY "providerReference"
    HAVING COUNT(*) > 1
  `;

  for (const dup of duplicates) {
    const records = await prisma.payment.findMany({
      where: { providerReference: dup.providerReference },
      orderBy: { createdAt: "desc" },
    });

    const [keep, ...remove] = records;

    await prisma.payment.deleteMany({
      where: { id: { in: remove.map((r: any) => r.id) } },
    });
  }
}

async function main() {
  await cleanInstallments();
  await cleanPayments();
}

main()
  .then(() => {
    console.log("Cleanup completed");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
