import { prisma, FinancingStatus } from "@/infrastructure/prisma";
import { z } from "zod";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/shared/utils/AppError";
import { InstallmentService } from "./installment.service";
import {
  DeactivateInstallmentPlanSchema,
  UpdateInstallmentPlanSchema,
} from "@/shared/schemas/installment-plan.schema";

export class InstallmentPlanService {
  static async getInstallmentPlansByProduct(productId: string) {
    const plans = await prisma.productInstallmentPlan.findMany({
      where: { productId },
      orderBy: { durationMonths: "asc" },
    });
    return plans;
  }

  static async getInstallmentPlanById(planId: string) {
    const plan = await prisma.productInstallmentPlan.findUnique({
      where: { planId },
      include: {
        kycApplications: {
          where: {
            status: {
              in: ["PENDING", "APPROVED"],
            },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError("Installment plan not found");
    }

    return plan;
  }

  static async updateInstallmentPlan(
    planId: string,
    data: z.infer<typeof UpdateInstallmentPlanSchema>,
  ) {
    const plan = await prisma.productInstallmentPlan.findUnique({
      where: { planId },
      include: {
        kycApplications: {
          where: {
            status: "PENDING",
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError("Installment plan not found");
    }

    if (plan.kycApplications.length > 0 && data.active !== undefined) {
      throw new BadRequestError(
        "Cannot modify plan active status while there are pending KYC applications",
      );
    }

    const updateData: any = {
      ...(data.durationMonths !== undefined && {
        durationMonths: data.durationMonths,
      }),
      ...(data.interestPercentage !== undefined && {
        interestPercentage: data.interestPercentage,
      }),
      ...(data.active !== undefined && { active: data.active }),
    };

    return prisma.productInstallmentPlan.update({
      where: { planId },
      data: updateData,
    });
  }

  static async deactivateInstallmentPlan(
    planId: string,
    data: z.infer<typeof DeactivateInstallmentPlanSchema>,
  ) {
    const plan = await prisma.productInstallmentPlan.findUnique({
      where: { planId },
      include: {
        kycApplications: {
          where: {
            status: "PENDING",
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError("Installment plan not found");
    }

    if (plan.kycApplications.length > 0) {
      throw new BadRequestError(
        "Cannot deactivate plan with pending KYC applications. Wait for applications to be processed.",
      );
    }

    const updated = await prisma.productInstallmentPlan.update({
      where: { planId },
      data: { active: data.active },
    });

    return updated;
  }

  static async createInstallmentPlan(productId: string, data: {
    durationMonths: number;
    interestPercentage: number;
    active?: boolean;
  }) {
    const product = await prisma.product.findUnique({
      where: { productId },
    });

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    return prisma.productInstallmentPlan.create({
      data: {
        productId,
        durationMonths: data.durationMonths,
        interestPercentage: data.interestPercentage,
        active: data.active ?? true,
      },
    });
  }

  static async countActiveContractsForPlan(planId: string) {
    return prisma.kycApplication.count({
      where: {
        installmentPlanId: planId,
        status: {
          in: ["PENDING", "APPROVED"],
        },
      },
    });
  }
}