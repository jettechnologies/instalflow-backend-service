import { MerchantSettlementService } from "@/core/services/merchant-settlement.service";
import logger from "@/infrastructure/logger/logger";

// Weekly, fully automatic: generates+auto-approves settlements from newly
// PAID installments, then queues transfers for any settlement whose company
// already has a verified bank account on file. No HTTP trigger is required
// for either step — see DOMAIN_MODEL.md "Merchant Settlement".
export class MerchantSettlementGenerationWorker {
  static async run(): Promise<void> {
    logger.info(
      "[MerchantSettlementGenerationWorker] Starting settlement generation sweep",
    );

    try {
      const generated = await MerchantSettlementService.generatePendingSettlements();
      logger.info(
        `[MerchantSettlementGenerationWorker] Generated ${generated.length} settlement(s)`,
      );

      const queued = await MerchantSettlementService.queueEligibleTransfers();
      logger.info(
        `[MerchantSettlementGenerationWorker] Queued ${queued.length} transfer(s)`,
      );
    } catch (error: any) {
      logger.error(
        "[MerchantSettlementGenerationWorker] Fatal error during settlement sweep",
        { exception: error?.message, stack: error?.stack },
      );
    }
  }
}
