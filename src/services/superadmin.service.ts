import { prisma } from "../../prisma/client.js";
import AppError, {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../libs/AppError.js";

interface CreatePlanData {
  name: string;
  description?: string;
  price: number;
  discountPrice?: number;
  discountPercentage?: number;
  interval: "WEEKLY" | "MONTHLY" | "YEARLY";
}

export class SuperAdminService {
  /**
   * Create a new subscription plan
   */
  static async createSubscriptionPlan(data: CreatePlanData) {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictError(
        "A subscription plan with this name already exists",
      );
    }

    return prisma.subscriptionPlan.create({
      data: {
        ...data,
      },
    });
  }

  /**
   * Update an existing subscription plan
   */
  static async updateSubscriptionPlan(
    planId: string,
    data: Partial<CreatePlanData> & { active?: boolean },
  ) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId },
    });

    if (!plan) {
      throw new NotFoundError("Subscription plan not found");
    }

    return prisma.subscriptionPlan.update({
      where: { planId },
      data,
    });
  }

  /**
   * List all plans (including inactive ones) - Internal Use
   */
  static async getAllSubscriptionPlans() {
    return prisma.subscriptionPlan.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Toggle plan status
   */
  static async togglePlanStatus(planId: string, active: boolean) {
    return prisma.subscriptionPlan.update({
      where: { planId },
      data: { active },
    });
  }

  /**
   * Delete a plan (only if no active subscriptions exist or archive instead)
   */
  static async deleteSubscriptionPlan(planId: string) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId },
      include: { _count: { select: { subscriptions: true } } },
    });

    if (!plan) {
      throw new NotFoundError("Subscription plan not found");
    }

    if (plan._count.subscriptions > 0) {
      throw new BadRequestError(
        "Cannot delete plan with active subscriptions. Deactivate it instead.",
      );
    }

    return prisma.subscriptionPlan.delete({
      where: { planId },
    });
  }
}
