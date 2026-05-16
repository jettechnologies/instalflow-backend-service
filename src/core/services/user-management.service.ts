import { prisma, ApprovalAction, ApprovalStatus, Role } from "@/infrastructure/prisma";
import crypto from "crypto";
import { z } from "zod";
import { bcryptHash } from "@/shared/utils/password-hash-verify";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "@/shared/utils/AppError";
import {
  CreateAdminSchema,
  ToggleStatusSchema,
  HandleApprovalSchema,
} from "@/shared/schemas/user-management.schema";

export class UserManagementService {
  /**
   * ==========================================
   * COMPANY ROLE ACTIONS
   * ==========================================
   */

  /**
   * Create an ADMIN user under the company.
   */
  static async createAdmin(
    companyId: string,
    creatorId: string,
    data: z.infer<typeof CreateAdminSchema>
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

    return { user, tempPassword };
  }

  /**
   * Directly toggle an ADMIN's active status (Company only).
   */
  static async toggleAdminStatus(
    companyId: string,
    adminId: string,
    data: z.infer<typeof ToggleStatusSchema>
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

  /**
   * Directly soft delete an ADMIN (Company only).
   */
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

    // Optionally revoke all active sessions for this admin
    await prisma.userSession.updateMany({
      where: { user: { userId: adminId }, revoked: false },
      data: { revoked: true },
    });

    return updated;
  }

  /**
   * Handle an ApprovalRequest (Company only).
   */
  static async handleApprovalRequest(
    companyId: string,
    requestId: string,
    data: z.infer<typeof HandleApprovalSchema>
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

    // Process Approval
    await prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: ApprovalStatus.APPROVED },
      });

      if (request.action === ApprovalAction.TOGGLE_ACTIVE) {
        await tx.user.update({
          where: { userId: request.targetUserId },
          // If active is true, we want to toggle to false. If false, toggle to true.
          // The request doesn't hold the requested boolean state, so we just flip it.
          // Wait, the prompt implies toggle on/off. We'll flip the current state.
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

  /**
   * Get all pending approval requests for the company.
   */
  static async getPendingApprovals(companyId: string) {
    return prisma.approvalRequest.findMany({
      where: { companyId, status: ApprovalStatus.PENDING },
      include: {
        requestedBy: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true, role: true, active: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * ==========================================
   * ADMIN ROLE ACTIONS (Maker-Checker)
   * ==========================================
   */

  /**
   * Enforce Rule: Admin cannot act on Marketers directly created by Company users.
   */
  private static async ensureAdminCanManageMarketer(
    adminCompanyId: string,
    marketerId: string
  ) {
    const marketer = await prisma.user.findFirst({
      where: { userId: marketerId, companyId: adminCompanyId, role: Role.MARKETER, deletedAt: null },
      include: { creator: true },
    });

    if (!marketer) throw new NotFoundError("Marketer not found or deleted");

    // If marketer was created by a COMPANY role user, Admin cannot manage them.
    if (marketer.creator && marketer.creator.role === Role.COMPANY) {
      throw new ForbiddenError("You cannot modify a marketer created by the Company Owner.");
    }

    return marketer;
  }

  /**
   * Request to toggle a MARKETER's active status.
   */
  static async requestMarketerToggle(
    adminId: string,
    companyId: string,
    marketerId: string
  ) {
    await this.ensureAdminCanManageMarketer(companyId, marketerId);

    // Check if there's already a pending request for this
    const existing = await prisma.approvalRequest.findFirst({
      where: {
        companyId,
        targetUserId: marketerId,
        action: ApprovalAction.TOGGLE_ACTIVE,
        status: ApprovalStatus.PENDING,
      },
    });
    if (existing) throw new ConflictError("A toggle request is already pending for this user.");

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

  /**
   * Request to soft delete a MARKETER.
   */
  static async requestMarketerDeletion(
    adminId: string,
    companyId: string,
    marketerId: string
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
    if (existing) throw new ConflictError("A deletion request is already pending for this user.");

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
}
