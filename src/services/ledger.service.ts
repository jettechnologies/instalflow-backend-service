import { prisma, Prisma, AccountType } from "@/prisma/client.js";

export class LedgerService {
  /**
   * Records a balanced double-entry transaction.
   * Total Debits must equal Total Credits.
   */
  static async recordTransaction(
    data: {
      reference: string;
      description: string;
      companyId?: string;
      entries: {
        accountName: string;
        accountType: AccountType;
        debit?: number | Prisma.Decimal;
        credit?: number | Prisma.Decimal;
      }[];
      metadata?: any;
    },
    txClient?: any,
  ) {
    const totalDebits = data.entries.reduce(
      (acc, entry) => acc.plus(new Prisma.Decimal(entry.debit || 0)),
      new Prisma.Decimal(0),
    );
    const totalCredits = data.entries.reduce(
      (acc, entry) => acc.plus(new Prisma.Decimal(entry.credit || 0)),
      new Prisma.Decimal(0),
    );

    if (!totalDebits.equals(totalCredits)) {
      throw new Error(
        `Unbalanced Ledger Transaction: Debits (${totalDebits}) != Credits (${totalCredits})`,
      );
    }

    const execute = async (tx: any) => {
      // 1. Create the Transaction Parent
      const financialTx = await tx.financialTransaction.upsert({
        where: { reference: data.reference },
        update: {
          description: data.description,
          metadata: data.metadata || {},
        },
        create: {
          reference: data.reference,
          description: data.description,
          metadata: data.metadata || {},
        },
      });

      // 2. Process Entries
      for (const entry of data.entries) {
        // Find or create account with upsert-like logic (using findFirst + create)
        let account = await tx.ledgerAccount.findFirst({
          where: {
            name: entry.accountName,
            companyId: data.companyId || null,
          },
        });

        if (!account) {
          account = await tx.ledgerAccount.create({
            data: {
              name: entry.accountName,
              type: entry.accountType,
              companyId: data.companyId || null,
            },
          });
        }

        // Create Journal Entry (Atomic line)
        const lineRef = `${data.reference}_${entry.accountName}_${Math.random()
          .toString(36)
          .substring(7)}`;

        await tx.journalEntry.create({
          data: {
            transactionId: financialTx.id,
            ledgerAccountId: account.id,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
            reference: lineRef,
          },
        });

        // Update Account Balance
        const netChange = new Prisma.Decimal(entry.debit || 0).minus(
          new Prisma.Decimal(entry.credit || 0),
        );
        await tx.ledgerAccount.update({
          where: { id: account.id },
          data: { balance: { increment: netChange } },
        });
      }

      return financialTx;
    };

    return txClient
      ? await execute(txClient)
      : await prisma.$transaction(execute);
  }
}
