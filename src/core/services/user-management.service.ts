import {
  prisma,
  ApprovalAction,
  ApprovalStatus,
  Role,
  Prisma,
} from "@/infrastructure/prisma";
import crypto from "crypto";
import { z } from "zod";
import { bcryptHash } from "@/shared/utils/password-hash-verify";
import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from "@/shared/utils/AppError";
import {
  CreateAdminSchema,
  ToggleStatusSchema,
  HandleApprovalSchema,
} from "@/shared/schemas/user-management.schema";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";

export class UserManagementService {
  static async createAdmin(
    companyId: string,
    creatorId: string,
    data: z.infer<typeof CreateAdminSchema>,
  ) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictError("Email already in use");

    const tempPassword = `IFL_ADM_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const hashedPassword = await bcryptHash(tempPassword);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: Role.ADMIN,
        companyId: companyId,
        createdById: creatorId,
        forcePasswordChange: true,
      },
      select: {
        userId: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        active: true,
      },
    });

    emitEvent(DomainEvent.STAFF_CREATED, {
      email: user.email,
      name: user.name!,
      role: "Admin",
      tempPassword: tempPassword,
      dashboard_url: process.env.FRONTEND_URL,
    });

    return { user, tempPassword };
  }

  static async toggleAdminStatus(
    companyId: string,
    adminId: string,
    data: z.infer<typeof ToggleStatusSchema>,
  ) {
    const admin = await prisma.user.findFirst({
      where: { userId: adminId, companyId, role: Role.ADMIN, deletedAt: null },
    });
    if (!admin) throw new NotFoundError("Admin not found or deleted");

    const updated = await prisma.user.update({
      where: { userId: adminId },
      data: { active: data.active },
      select: { userId: true, name: true, active: true },
    });

    return updated;
  }

  static async softDeleteAdmin(companyId: string, adminId: string) {
    const admin = await prisma.user.findFirst({
      where: { userId: adminId, companyId, role: Role.ADMIN, deletedAt: null },
    });
    if (!admin) throw new NotFoundError("Admin not found or already deleted");

    const updated = await prisma.user.update({
      where: { userId: adminId },
      data: { deletedAt: new Date(), active: false },
      select: { userId: true, name: true, deletedAt: true },
    });

    await prisma.userSession.updateMany({
      where: { user: { userId: adminId }, revoked: false },
      data: { revoked: true },
    });

    return updated;
  }

  static async handleApprovalRequest(
    companyId: string,
    requestId: string,
    data: z.infer<typeof HandleApprovalSchema>,
  ) {
    const request = await prisma.approvalRequest.findFirst({
      where: { requestId, companyId, status: ApprovalStatus.PENDING },
      include: { targetUser: true },
    });
    if (!request) throw new NotFoundError("Pending approval request not found");

    if (data.status === ApprovalStatus.REJECTED) {
      await prisma.approvalRequest.update({
        where: { id: request.id },
        data: { status: ApprovalStatus.REJECTED },
      });
      return { message: "Request rejected" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: ApprovalStatus.APPROVED },
      });

      if (request.action === ApprovalAction.TOGGLE_ACTIVE) {
        await tx.user.update({
          where: { userId: request.targetUserId },
          data: { active: !request.targetUser.active },
        });
      } else if (request.action === ApprovalAction.SOFT_DELETE) {
        await tx.user.update({
          where: { userId: request.targetUserId },
          data: { deletedAt: new Date(), active: false },
        });

        await tx.userSession.updateMany({
          where: { user: { userId: request.targetUserId }, revoked: false },
          data: { revoked: true },
        });
      }
    });

    return { message: "Request approved and action executed" };
  }

  static async getPendingApprovals(companyId: string) {
    return prisma.approvalRequest.findMany({
      where: { companyId, status: ApprovalStatus.PENDING },
      include: {
        requestedBy: { select: { name: true, email: true } },
        targetUser: {
          select: { name: true, email: true, role: true, active: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private static async ensureAdminCanManageMarketer(
    adminCompanyId: string,
    marketerId: string,
  ) {
    const marketer = await prisma.user.findFirst({
      where: {
        userId: marketerId,
        companyId: adminCompanyId,
        role: Role.MARKETER,
        deletedAt: null,
      },
      include: { creator: true },
    });

    if (!marketer) throw new NotFoundError("Marketer not found or deleted");

    if (marketer.creator && marketer.creator.role === Role.COMPANY) {
      throw new ForbiddenError(
        "You cannot modify a marketer created by the Company Owner.",
      );
    }

    return marketer;
  }

  static async requestMarketerToggle(
    adminId: string,
    companyId: string,
    marketerId: string,
  ) {
    await this.ensureAdminCanManageMarketer(companyId, marketerId);

    const existing = await prisma.approvalRequest.findFirst({
      where: {
        companyId,
        targetUserId: marketerId,
        action: ApprovalAction.TOGGLE_ACTIVE,
        status: ApprovalStatus.PENDING,
      },
    });
    if (existing)
      throw new ConflictError(
        "A toggle request is already pending for this user.",
      );

    const request = await prisma.approvalRequest.create({
      data: {
        companyId,
        requestedById: adminId,
        targetUserId: marketerId,
        action: ApprovalAction.TOGGLE_ACTIVE,
      },
      select: {
        requestId: true,
        action: true,
        status: true,
        createdAt: true,
      },
    });

    return request;
  }

  static async requestMarketerDeletion(
    adminId: string,
    companyId: string,
    marketerId: string,
  ) {
    await this.ensureAdminCanManageMarketer(companyId, marketerId);

    const existing = await prisma.approvalRequest.findFirst({
      where: {
        companyId,
        targetUserId: marketerId,
        action: ApprovalAction.SOFT_DELETE,
        status: ApprovalStatus.PENDING,
      },
    });
    if (existing)
      throw new ConflictError(
        "A deletion request is already pending for this user.",
      );

    const request = await prisma.approvalRequest.create({
      data: {
        companyId,
        requestedById: adminId,
        targetUserId: marketerId,
        action: ApprovalAction.SOFT_DELETE,
      },
      select: {
        requestId: true,
        action: true,
        status: true,
        createdAt: true,
      },
    });

    return request;
  }

  static async getAdminMarketers(params: {
    adminId: string;
    companyId: string;
    page?: number;
    limit?: number;
    sortOrder?: "asc" | "desc";
  }) {
    const {
      adminId,
      companyId,
      page = 1,
      limit = 10,
      sortOrder = "desc",
    } = params;

    const skip = (page - 1) * limit;

    // Ensure admin exists and belongs to the company
    const admin = await prisma.user.findFirst({
      where: {
        userId: adminId,
        companyId,
        role: {
          in: [Role.ADMIN, Role.COMPANY],
        },
        deletedAt: null,
      },

      select: {
        userId: true,
      },
    });

    if (!admin) {
      throw new ForbiddenError(
        "You are not allowed to access these marketers.",
      );
    }

    const whereClause: Prisma.UserWhereInput = {
      createdById: adminId,
      companyId,
      role: Role.MARKETER,
      deletedAt: null,
    };

    const [marketers, total] = await prisma.$transaction([
      prisma.user.findMany({
        where: whereClause,

        skip,
        take: limit,

        orderBy: {
          createdAt: sortOrder,
        },

        select: {
          userId: true,
          name: true,
          email: true,
          role: true,
          active: true,
          referralCode: true,
          createdAt: true,
          updatedAt: true,

          _count: {
            select: {
              referredUsers: true,
            },
          },
        },
      }),

      prisma.user.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const pagination = {
      total,
      totalPages,
      currentPage: page,
      limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    return {
      marketers,
      pagination,
    };
  }
}
