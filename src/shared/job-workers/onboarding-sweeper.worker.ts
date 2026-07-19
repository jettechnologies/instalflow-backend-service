import { OnboardingService } from "@/core/services/onboarding.service";

export class OnboardingSweeperWorker {
  /**
   * Expires stale provisional onboarding sessions (PRD §7.4 / §8).
   * Drains in bounded batches and re-enqueues itself if a full batch was
   * processed, so a large backlog is cleaned without waiting for the next cron.
   */
  static async run(batchSize = 500): Promise<{ drained: boolean }> {
    const expiredCount =
      await OnboardingService.expireStaleOnboardingSessions(batchSize);

    console.log(
      `🧹 [OnboardingSweeperWorker] Expired ${expiredCount} stale onboarding session(s).`,
    );

    return { drained: expiredCount < batchSize };
  }
}
