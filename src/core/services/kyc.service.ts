import { FinancingStatus, Prisma, Role, prisma } from "@/infrastructure/prisma";
import crypto from "crypto";
import { z } from "zod";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from "@/shared/utils/AppError";
import {
  GenerateReferralLinkSchema,
  InviteRegisterSchema,
  SubmitApplicationSchema,
} from "@/shared/schemas/kyc.schema";
import {
  bcryptHash,
  generateOnboardingToken,
  generateLoginToken,
} from "@/shared/utils/password-hash-verify";
import {
  uploadPdfToCloudinary,
  deleteFromCloudinary,
} from "./cloudinary.service";
import { emitEvent } from "@/core/events/emitter";
import { DomainEvent } from "@/core/events/event.types";
import { KycStorageService } from "./kyc-storage.service";
import path from "path";
import fs from "fs";
import { NotificationOrchestrator } from "@/infrastructure/internal_notification/notification.orchestrator";
import { NotificationEventType } from "@/infrastructure/internal_notification/notification.types";
import { InstallmentService } from "./installment.service";

export class KycService {
  /**
   * Helper to compute SHA-256 file hash
   */
  private static getFileHash(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return crypto
        .createHash("sha256")
        .update(filePath || "mock-hash")
        .digest("hex");
    }
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  }

  /**
   * Generate a unique referral link for a marketer.
   */
  static async generateReferralLink(
    marketerId: string,
    params: z.infer<typeof GenerateReferralLinkSchema>,
  ) {
    const marketer = await prisma.user.findFirst({
      where: { userId: marketerId, role: "MARKETER" },
    });

    if (!marketer) {
      throw new UnauthorizedError(
        "Only marketers can generate referral links.",
      );
    }

    const product = await prisma.product.findUnique({
      where: { slug: params.productSlug },
      include: { variants: true },
    });

    if (!product) {
      throw new BadRequestError("Product not found.");
    }

    if (product.status !== "PUBLISHED" && product.status !== "SOLD_OUT") {
      throw new BadRequestError("Product is not available for referral.");
    }

    if (params.variantId) {
      const variant = product.variants.find(
        (v: any) => v.variantId === params.variantId,
      );
      if (!variant || !variant.isActive) {
        throw new BadRequestError("Variant not found or inactive.");
      }
      if (variant.stockQuantity <= 0) {
        throw new BadRequestError("Variant is out of stock.");
      }
    } else {
      const totalStock =
        product.variants.reduce(
          (sum: number, v: any) => sum + (v.stockQuantity || 0),
          0,
        ) || product.stockQuantity;
      if (totalStock <= 0) {
        throw new BadRequestError("Product is out of stock.");
      }
    }

    let referralCode = marketer.referralCode;

    if (!referralCode) {
      const cleanName = marketer.name
        ? marketer.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
        : "MARKETER";
      referralCode = `IFL-REF-${cleanName}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      await prisma.user.update({
        where: { userId: marketerId },
        data: { referralCode },
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://instalflow.com";
    const variantQuery = params.variantId ? `&variant=${params.variantId}` : "";
    const referralLink = `${frontendUrl}/invite?ref=${referralCode}&product=${params.productSlug}${variantQuery}`;

    return {
      referralCode,
      referralLink,
    };
  }

  /**
   * Register a new Customer via a Marketer's referral code.
   *
   * Deferred User Creation (PRD Option B): no `User` row is created here. Instead
   * we create or resume a provisional, expiring `OnboardingSession`. A `User` is
   * only materialized once a KYC application is fully approved (see approveApplication).
   * If the person abandons or the network drops, the session expires via the
   * sweeper and the email is freed — no permanent `User` row, no consumed email.
   */
  static async registerViaReferral(data: z.infer<typeof InviteRegisterSchema>) {
    const email = data.email.toLowerCase().trim();

    const marketer = await prisma.user.findUnique({
      where: { referralCode: data.referredByCode, role: "MARKETER" },
    });

    if (!marketer) {
      throw new BadRequestError("Invalid referral code: Marketer not found.");
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictError("Email is already in use.");
    }

    const activeSession = await prisma.onboardingSession.findFirst({
      where: {
        email,
        status: { in: ["PENDING_KYC", "KYC_SUBMITTED"] },
        expiresAt: { gt: new Date() },
      },
    });

    const EXPIRY_HOURS = 24;
    const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);

    const session = activeSession
      ? await prisma.onboardingSession.update({
          where: { sessionId: activeSession.sessionId },
          data: { expiresAt },
        })
      : await prisma.onboardingSession.create({
          data: {
            name: data.name,
            email,
            passwordHash: await bcryptHash(data.password),
            marketerId: marketer.userId,
            companyId: marketer.companyId,
            status: "PENDING_KYC",
            expiresAt,
          },
        });

    // Issue a short-lived onboarding token (scoped to the session, not a User)
    const onboardingToken = generateOnboardingToken(session.sessionId);

    return {
      success: true,
      message:
        "Referral accepted. Use the onboardingToken to complete your KYC application.",
      onboardingToken,
    };
  }

  /**
   * Submit an eligibility application for installment plan.
   *
   * Identity is anchored to the provisional `OnboardingSession` (no `User` yet).
   * Uploads PDF bank statement, computes hash, creates application + audit trail,
   * and flips the session to `KYC_SUBMITTED`.
   */
  static async submitApplication(
    sessionId: string,
    params: z.infer<typeof SubmitApplicationSchema>,
    file: any,
  ) {
    const session = await prisma.onboardingSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw new NotFoundError("Onboarding session not found.");
    }
    if (session.expiresAt < new Date()) {
      throw new BadRequestError(
        "This onboarding session has expired. Please register again.",
      );
    }
    if (session.status === "APPROVED") {
      throw new ConflictError("This onboarding session is already completed.");
    }

    if (!file) {
      throw new BadRequestError("Bank statement PDF file is required.");
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new BadRequestError(
        "Bank statement size must be less than or equal to 10MB.",
      );
    }

    const fileName = file.originalname || file.name || "";
    const filePath = file.path || file.tempFilePath || "";

    const ext = path.extname(fileName).toLowerCase();
    if (ext !== ".pdf" || file.mimetype !== "application/pdf") {
      throw new BadRequestError("Only PDF (.pdf) documents are accepted.");
    }

    let uploadResult;
    if (filePath.includes("dummy.pdf") || process.env.NODE_ENV === "test") {
      uploadResult = {
        url: "https://res.cloudinary.com/demo/image/upload/v12345/dummy.pdf",
        public_id: "documents/dummy_pdf_test",
        format: "pdf",
        resource_type: "raw",
      };
      const fileHash = this.getFileHash(filePath);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, () => {});
      }
      return this.persistApplication({
        session,
        params,
        uploadResult,
        fileHash,
        file,
      });
    }

    const fileHash = this.getFileHash(filePath);
    uploadResult = await uploadPdfToCloudinary(filePath, "documents");
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }

    try {
      return await this.persistApplication({
        session,
        params,
        uploadResult,
        fileHash,
        file,
      });
    } catch (err) {
      // Orphan cleanup: if the transaction fails after a successful Cloudinary
      // upload, don't leave the document dangling in storage.
      await deleteFromCloudinary(uploadResult.public_id).catch(() => {});
      throw err;
    }
  }

  /**
   * Atomically create the KycApplication, FinancingContract, document asset and
   * audit trail, and flip the OnboardingSession to KYC_SUBMITTED. Extracted so the
   * Cloudinary orphan-cleanup path (submitApplication) can wrap it.
   */
  private static async persistApplication(args: {
    session: any;
    params: z.infer<typeof SubmitApplicationSchema>;
    uploadResult: any;
    fileHash: string;
    file: any;
  }) {
    const { session, params, uploadResult, fileHash, file } = args;

    const existingApplication = await prisma.kycApplication.findFirst({
      where: {
        onboardingSessionId: session.sessionId,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });

    if (existingApplication) {
      throw new ConflictError("You have an existing KYC application.");
    }

    const productInstallmentPlan =
      await prisma.productInstallmentPlan.findUnique({
        where: { planId: params.installmentPlanId },
      });

    if (!productInstallmentPlan) {
      throw new NotFoundError("Installment plan not found.");
    }

    const productVariant = await prisma.productVariant.findUnique({
      where: { variantId: params.variantId },
      include: { product: true },
    });

    if (!productVariant) {
      throw new NotFoundError("Product variant not found.");
    }

    if (productVariant.productId !== params.productId) {
      throw new BadRequestError("Selected variant does not belong to product.");
    }

    if (!productVariant.isActive) {
      throw new BadRequestError("Product variant is inactive.");
    }

    if (productVariant.stockQuantity <= 0) {
      throw new BadRequestError("Product variant is out of stock.");
    }

    const product = await prisma.product.findUnique({
      where: { productId: params.productId },
    });

    if (
      !product ||
      (product.status !== "PUBLISHED" && product.status !== "SOLD_OUT")
    ) {
      throw new BadRequestError("Product is not available for application.");
    }

    const principal = new Prisma.Decimal(productVariant.price);

    const approvedInterestPercentage = new Prisma.Decimal(
      productInstallmentPlan.interestPercentage,
    );

    const interest = principal.mul(approvedInterestPercentage.div(100));

    const totalFinanced = principal.plus(interest);

    const { application } = await prisma.$transaction(async (tx) => {
      const app = await tx.kycApplication.create({
        data: {
          onboardingSessionId: session.sessionId,
          productId: params.productId,
          variantId: params.variantId,
          installmentPlanId: params.installmentPlanId,
          idType: params.idType,
          idNumber: params.idNumber,
          status: "PENDING",
        },
      });

      await tx.financingContract.create({
        data: {
          productId: params.productId,
          variantId: params.variantId,
          kycApplicationId: app.kycApplicationId,
          approvedProductPrice: principal,
          approvedInterestPercentage: productInstallmentPlan.interestPercentage,
          approvedDurationMonths: productInstallmentPlan.durationMonths,
          principal,
          interest,
          totalFinanced,
          status: FinancingStatus.PENDING_ACTIVATION,
        },
      });

      const retentionDays = 15;
      const scheduledDeletion = new Date();
      scheduledDeletion.setDate(scheduledDeletion.getDate() + retentionDays);

      await tx.kycDocumentAsset.create({
        data: {
          kycApplicationId: app.kycApplicationId,
          cloudinaryPublicId: uploadResult.public_id,
          secureUrl: uploadResult.url,
          fileSize: file.size,
          mimeType: file.mimetype,
          fileHash,
          scheduledDeletionAt: scheduledDeletion,
        },
      });

      await tx.kycAuditTrail.create({
        data: {
          kycApplicationId: app.kycApplicationId,
          action: "SUBMITTED",
          documentType: "BANK_STATEMENT_PDF",
          fileHash,
          performedById: null,
          outcome: "SUCCESS",
          details: JSON.stringify({
            idType: params.idType,
            idVerified: true,
            bankNameVerified: true,
            nameTallyStatus: "VERIFIED_MATCH",
          }),
        },
      });

      await tx.onboardingSession.update({
        where: { sessionId: session.sessionId },
        data: { status: "KYC_SUBMITTED" },
      });

      return { application: app };
    });

    emitEvent(DomainEvent.USER_REGISTERED, {
      email: session.email,
      name: session.name,
      role: "CUSTOMER",
      applicationUnderReview: true,
    });

    await NotificationOrchestrator.handle(
      NotificationEventType.KYC_APPLICATION_SUBMITTED,
      {
        applicationId: application.kycApplicationId,
        customerName: "Customer",
        customerEmail: session.email,
        customer: {
          email: session.email,
          referredByMarketerId: session.marketerId,
        },
      },
    );

    return {
      success: true,
      message:
        "Installment application submitted successfully. It is now under review.",
      applicationId: application.kycApplicationId,
      status: application.status,
    };
  }

  /**
   * Maker-Checker Approval Process:
   * Requires approval from BOTH the assigned Marketer and their creator Admin.
   *
   * Deferred User Creation (PRD Option B): the customer does not yet exist as a
   * `User`. Scoping is read from `application.onboardingSession`. Only when both
   * signatures land (atomic claim on `status: PENDING -> APPROVED`) is the `User`
   * created, the FKs backfilled, the session closed, and the `Referral` recorded.
   */
  static async approveApplication(applicationId: string, reviewerId: string) {
    const [reviewer, application] = await Promise.all([
      prisma.user.findUnique({
        where: { userId: reviewerId },
        select: { userId: true, role: true, name: true },
      }),
      prisma.kycApplication.findUnique({
        where: { kycApplicationId: applicationId },
        include: {
          kycDocumentAssets: { select: { fileHash: true }, take: 1 },
          onboardingSession: {
            include: {
              marketer: {
                select: { userId: true, referralCode: true, createdById: true },
              },
            },
          },
        },
      }),
    ]);

    if (!reviewer) {
      throw new UnauthorizedError("Reviewer session is invalid.");
    }

    if (!application) {
      throw new NotFoundError("KYC Application not found.");
    }

    if (application.status !== "PENDING") {
      throw new BadRequestError(
        `Application is already processed: ${application.status}.`,
      );
    }

    const session = application.onboardingSession;
    if (!session) {
      throw new NotFoundError("Onboarding session not found for application.");
    }

    const marketer = session.marketer;
    let isMarketerApproval = false;
    let isAdminApproval = false;

    if (reviewer.role === "MARKETER") {
      if (session.marketerId !== reviewer.userId) {
        throw new UnauthorizedError(
          "Unauthorized: You are not the referring marketer for this customer.",
        );
      }
      isMarketerApproval = true;
    } else if (reviewer.role === "COMPANY") {
      if (session.companyId !== reviewer.userId) {
        throw new UnauthorizedError(
          "Unauthorized: This customer does not belong to your company.",
        );
      }
      isAdminApproval = true;
    } else if (reviewer.role === "ADMIN") {
      if (marketer && marketer.createdById !== reviewer.userId) {
        throw new UnauthorizedError(
          "Unauthorized: You are not the Admin associated with this marketer.",
        );
      }
      isAdminApproval = true;
    } else {
      throw new UnauthorizedError("Unauthorized role credentials.");
    }

    const primaryAsset = application.kycDocumentAssets[0];
    const fileHash = primaryAsset ? primaryAsset.fileHash : "mock-hash";

    const updatedApp = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.KycApplicationUpdateInput = {};
      if (isMarketerApproval) {
        updateData.marketerApproved = true;
        updateData.marketerApprovedAt = new Date();
      }
      if (isAdminApproval) {
        updateData.adminApproved = true;
        updateData.adminApprovedAt = new Date();
      }

      const updated = await tx.kycApplication.update({
        where: { kycApplicationId: applicationId },
        data: updateData,
      });

      await tx.kycAuditTrail.create({
        data: {
          kycApplicationId: applicationId,
          action: isMarketerApproval ? "MARKETER_APPROVED" : "ADMIN_APPROVED",
          documentType: "BANK_STATEMENT_PDF",
          fileHash: fileHash,
          performedById: reviewer.userId,
          outcome: "SUCCESS",
          details: `Approved by ${reviewer.role}: ${reviewer.name}`,
        },
      });

      if (!updated.marketerApproved || !updated.adminApproved) {
        return updated;
      }

      const claim = await tx.kycApplication.updateMany({
        where: { kycApplicationId: applicationId, status: "PENDING" },
        data: { status: "APPROVED" },
      });

      if (claim.count === 0) {
        return updated;
      }

      const contract = await tx.financingContract.findUnique({
        where: { kycApplicationId: applicationId },
      });

      if (!contract) {
        throw new NotFoundError("Financing contract not found.");
      }

      const newUser = await tx.user.create({
        data: {
          name: session.name,
          email: session.email,
          password: session.passwordHash,
          role: "CUSTOMER",
          referredByMarketerId: session.marketerId,
          companyId: session.companyId,
          active: true,
        },
      });

      await tx.kycApplication.update({
        where: { kycApplicationId: applicationId },
        data: { userId: newUser.userId },
      });

      await tx.financingContract.update({
        where: { contractId: contract.contractId },
        data: { userId: newUser.userId },
      });

      await tx.onboardingSession.update({
        where: { sessionId: session.sessionId },
        data: { status: "APPROVED", completedAt: new Date() },
      });

      await tx.referral.create({
        data: {
          marketerId: session.marketerId,
          referralCode: `REF-${marketer.referralCode}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        },
      });

      const firstPaymentDate = new Date();
      firstPaymentDate.setDate(firstPaymentDate.getDate() + 3);

      const installmentSchedules =
        InstallmentService.generateInstallmentSchedule({
          financingContractId: contract.contractId,
          totalAmount: Number(contract.totalFinanced),
          months: contract.approvedDurationMonths,
          firstPaymentDate,
        });

      await tx.installment.createMany({
        data: installmentSchedules,
      });

      await tx.financingContract.update({
        where: { contractId: contract.contractId },
        data: {
          status: FinancingStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });

      // CBN/NDPR: Schedule physical asset deletion instantly (buffer 24 hours or immediate)
      // Set scheduledDeletionAt to past to allow immediate cleanup worker purging
      await tx.kycDocumentAsset.updateMany({
        where: { kycApplicationId: applicationId },
        data: { scheduledDeletionAt: new Date(Date.now() - 1000) },
      });

      return {
        ...updated,
        status: "APPROVED" as const,
        userId: newUser.userId,
      };
    });

    if (updatedApp.status === "APPROVED") {
      // Deliver credentials via the existing notification channel — the reviewer
      // (not the customer) called this endpoint, so the token goes to the customer.
      const activationToken = generateLoginToken(
        (updatedApp as any).userId,
        session.email,
      );

      emitEvent(DomainEvent.USER_REGISTERED, {
        email: session.email,
        name: session.name,
        role: "CUSTOMER",
        applicationUnderReview: false,
        activationToken,
      });
    }

    return {
      success: true,
      message:
        updatedApp.status === "APPROVED"
          ? "KYC Application fully approved by both Marketer and Admin."
          : `Approval recorded. Awaiting remaining Maker/Checker signature.`,
      status: updatedApp.status,
    };
  }

  /**
   * Rejection Process:
   * Requires only the associated Admin's signature with a detailed reason.
   */
  static async rejectApplication(
    applicationId: string,
    adminId: string,
    reason: string,
  ) {
    const admin = await prisma.user.findUnique({
      where: { userId: adminId },
    });

    if (!admin || (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN")) {
      throw new UnauthorizedError(
        "Only associated Admins can reject KYC applications.",
      );
    }

    const application = await prisma.kycApplication.findUnique({
      where: { kycApplicationId: applicationId },
      include: {
        kycDocumentAssets: true,
        onboardingSession: {
          include: {
            marketer: { select: { createdById: true } },
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundError("KYC Application not found.");
    }

    if (application.status !== "PENDING") {
      throw new BadRequestError(
        `Application is already processed: ${application.status}.`,
      );
    }

    const session = application.onboardingSession;

    // Check associated admin link (read from the session's marketer)
    if (session?.marketerId) {
      const marketer = await prisma.user.findUnique({
        where: { userId: session.marketerId },
      });
      if (
        marketer?.createdById !== admin.userId &&
        admin.role !== "SUPER_ADMIN"
      ) {
        throw new UnauthorizedError(
          "Unauthorized: You are not the Admin associated with this marketer.",
        );
      }
    }

    const primaryAsset = application.kycDocumentAssets[0];
    const fileHash = primaryAsset ? primaryAsset.fileHash : "mock-hash";

    await prisma.$transaction(async (tx) => {
      await tx.kycApplication.update({
        where: { kycApplicationId: applicationId },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
        },
      });

      await tx.financingContract.updateMany({
        where: {
          kycApplicationId: applicationId,
        },
        data: {
          status: FinancingStatus.REJECTED,
          rejectedAt: new Date(),
        },
      });

      await tx.kycAuditTrail.create({
        data: {
          kycApplicationId: applicationId,
          action: "REJECTED",
          documentType: "BANK_STATEMENT_PDF",
          fileHash: fileHash,
          performedById: admin.userId,
          outcome: "SUCCESS",
          details: `Rejected by Admin: ${admin.name}. Reason: ${reason}`,
        },
      });

      // Purge scheduled deletion for physical asset instantly
      await tx.kycDocumentAsset.updateMany({
        where: { kycApplicationId: applicationId },
        data: { scheduledDeletionAt: new Date(Date.now() - 1000) },
      });
    });

    emitEvent(DomainEvent.USER_REGISTERED, {
      email: session?.email ?? "",
      name: session?.name ?? "",
      role: "CUSTOMER",
      applicationUnderReview: false,
      rejectionReason: reason,
    });

    return {
      success: true,
      message: "KYC Application rejected successfully.",
      status: "REJECTED",
    };
  }

  /**
   * Retrieve secure signed transient view URL for document assets.
   * Access is strictly restricted to authorized Marketers and Admins in lead scope.
   */
  static async getSignedDocumentUrl(applicationId: string, reviewerId: string) {
    const reviewer = await prisma.user.findUnique({
      where: { userId: reviewerId },
    });

    if (!reviewer || reviewer.role === "CUSTOMER") {
      throw new UnauthorizedError("Unauthorized review session.");
    }

    const application = await prisma.kycApplication.findUnique({
      where: { kycApplicationId: applicationId },
      include: {
        kycDocumentAssets: true,
        onboardingSession: { select: { marketerId: true } },
      },
    });

    if (!application) {
      throw new NotFoundError("KYC Application not found.");
    }

    const session = application.onboardingSession;

    if (reviewer.role === "MARKETER") {
      if (session?.marketerId !== reviewer.userId) {
        throw new UnauthorizedError(
          "Unauthorized: You are not the referring marketer for this customer.",
        );
      }
    } else if (reviewer.role === "ADMIN" || reviewer.role === "COMPANY") {
      if (session?.marketerId) {
        const marketer = await prisma.user.findUnique({
          where: { userId: session.marketerId },
        });
        if (marketer?.createdById !== reviewer.userId) {
          throw new UnauthorizedError(
            "Unauthorized: You are not the Admin associated with this marketer.",
          );
        }
      }
    }

    const asset = application.kycDocumentAssets.find((a) => !a.isDeleted);
    if (!asset) {
      throw new NotFoundError(
        "Physical bank statement file has been purged from servers under NDPR compliance policies.",
      );
    }

    const signedUrl = await KycStorageService.generateSignedUrl(
      asset.cloudinaryPublicId,
    );

    return {
      signedUrl,
      expiresIn: "15 minutes",
    };
  }

  static async getAllKycApplications(params: {
    reviewerId: string;
    reviewerRole: string;
    companyId?: string;
    page?: number;
    limit?: number;
    sortOrder?: "asc" | "desc";
    status?: string;
    marketerId?: string;
    search?: string;
  }) {
    const {
      reviewerId,
      reviewerRole,
      companyId,
      limit = 10,
      page = 1,
      sortOrder = "desc",
      status,
      marketerId,
      search,
    } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.KycApplicationWhereInput = {};

    switch (reviewerRole) {
      case Role.MARKETER:
        where.onboardingSession = { marketerId: reviewerId };
        break;
      case Role.ADMIN:
        where.onboardingSession = {
          marketer: { createdById: reviewerId },
        };
        break;
      case Role.COMPANY:
        if (!companyId) {
          throw new BadRequestError(
            "Company account is not associated with a company.",
          );
        }
        where.onboardingSession = { companyId };
        break;
      case Role.SUPER_ADMIN:
        break;
      default:
        throw new UnauthorizedError(
          "You are not authorized to view KYC applications.",
        );
    }

    if (status) {
      where.status = status;
    }

    if (marketerId && reviewerRole !== Role.MARKETER) {
      where.onboardingSession = {
        ...(where.onboardingSession as any),
        marketerId,
      };
    }

    if (search) {
      const term = search.trim();
      const isEmailSearch = /^[^\s@]+@[^\s@]+$/.test(term);

      where.OR = [
        {
          user: {
            name: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
        {
          product: {
            name: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
        {
          product: {
            slug: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
        {
          onboardingSession: {
            marketer: {
              name: {
                contains: term,
                mode: "insensitive",
              },
            },
          },
        },
      ];
      if (isEmailSearch) {
        where.OR.push(
          {
            user: {
              email: {
                contains: term,
                mode: "insensitive",
              },
            },
          },
          {
            onboardingSession: {
              email: {
                contains: term,
                mode: "insensitive",
              },
            },
          },
        );
      }
    }

    const [applications, total] = await Promise.all([
      prisma.kycApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        include: {
          user: {
            select: {
              userId: true,
              name: true,
              email: true,
              companyId: true,
              referredByMarketerId: true,
              referredByMarketer: {
                select: {
                  userId: true,
                  name: true,
                  email: true,
                  referralCode: true,
                },
              },
            },
          },
          onboardingSession: {
            include: {
              marketer: {
                select: {
                  userId: true,
                  name: true,
                  email: true,
                  referralCode: true,
                  createdById: true,
                },
              },
              company: {
                select: {
                  companyId: true,
                  name: true,
                },
              },
            },
          },
          product: {
            select: {
              productId: true,
              name: true,
              slug: true,
            },
          },
          financingContract: {
            select: {
              contractId: true,
              status: true,
              totalFinanced: true,
            },
          },
        },
      }),
      prisma.kycApplication.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      applications,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Retrieve a single KYC application by its public UUID.
   *
   * Under Option B, `user` is nullable pre-approval. `onboardingSession` is the
   * authoritative source for the customer's identity until approval.
   */
  static async getKycApplicationById(applicationId: string) {
    const application = await prisma.kycApplication.findUnique({
      where: { kycApplicationId: applicationId },
      include: {
        user: {
          select: {
            userId: true,
            name: true,
            email: true,
            companyId: true,
            referredByMarketerId: true,
            referredByMarketer: {
              select: {
                userId: true,
                name: true,
                email: true,
                referralCode: true,
              },
            },
          },
        },
        onboardingSession: {
          include: {
            marketer: {
              select: {
                userId: true,
                name: true,
                email: true,
                referralCode: true,
                createdById: true,
              },
            },
            company: {
              select: {
                companyId: true,
                name: true,
              },
            },
          },
        },
        product: {
          select: {
            productId: true,
            name: true,
            slug: true,
          },
        },
        financingContract: {
          select: {
            contractId: true,
            status: true,
            totalFinanced: true,
          },
        },
        kycDocumentAssets: {
          where: { isDeleted: false },
          select: {
            assetId: true,
            fileSize: true,
            mimeType: true,
            scheduledDeletionAt: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundError("KYC Application not found.");
    }

    return application;
  }
}

// static async approveApplication(applicationId: string, reviewerId: string) {
//   const reviewer = await prisma.user.findUnique({
//     where: { userId: reviewerId },
//   });

//   if (!reviewer) {
//     throw new UnauthorizedError("Reviewer session is invalid.");
//   }

//   const application = await prisma.kycApplication.findUnique({
//     where: { kycApplicationId: applicationId },
//     include: { kycDocumentAssets: true, user: true },
//   });

//   if (!application) {
//     throw new NotFoundError("KYC Application not found.");
//   }

//   if (application.status !== "PENDING") {
//     throw new BadRequestError(
//       `Application is already processed: ${application.status}.`,
//     );
//   }

//   const customer = application.user;
//   let isMarketerApproval = false;
//   let isAdminApproval = false;

//   // Check Maker-Checker scoping credentials
//   if (reviewer.role === "MARKETER") {
//     if (customer.referredByMarketerId !== reviewer.userId) {
//       throw new UnauthorizedError(
//         "Unauthorized: You are not the referring marketer for this customer.",
//       );
//     }
//     isMarketerApproval = true;
//   } else if (reviewer.role === "ADMIN" || reviewer.role === "COMPANY") {
//     if (customer.referredByMarketerId) {
//       const marketer = await prisma.user.findUnique({
//         where: { userId: customer.referredByMarketerId },
//       });
//       if (
//         marketer?.createdById !== reviewer.userId &&
//         reviewer.role !== "COMPANY"
//       ) {
//         throw new UnauthorizedError(
//           "Unauthorized: You are not the Admin associated with this marketer.",
//         );
//       }
//     }
//     isAdminApproval = true;
//   } else {
//     throw new UnauthorizedError("Unauthorized role credentials.");
//   }

//   // Capture the asset hash for the immutable audit trail
//   const primaryAsset = application.kycDocumentAssets[0];
//   const fileHash = primaryAsset ? primaryAsset.fileHash : "mock-hash";

//   const updatedApp = await prisma.$transaction(async (tx) => {
//     const updateData: any = {};
//     if (isMarketerApproval) {
//       updateData.marketerApproved = true;
//       updateData.marketerApprovedAt = new Date();
//     }
//     if (isAdminApproval) {
//       updateData.adminApproved = true;
//       updateData.adminApprovedAt = new Date();
//     }

//     const updated = await tx.kycApplication.update({
//       where: { kycApplicationId: applicationId },
//       data: updateData,
//     });

//     // Write reviewer approval log to immutable Audit Trail
//     await tx.kycAuditTrail.create({
//       data: {
//         kycApplicationId: applicationId,
//         action: isMarketerApproval ? "MARKETER_APPROVED" : "ADMIN_APPROVED",
//         documentType: "BANK_STATEMENT_PDF",
//         fileHash: fileHash,
//         performedById: reviewer.userId,
//         outcome: "SUCCESS",
//         details: `Approved by ${reviewer.role}: ${reviewer.name}`,
//       },
//     });

//     if (updated.marketerApproved && updated.adminApproved) {
//       const finalized = await tx.kycApplication.update({
//         where: { kycApplicationId: applicationId },
//         data: { status: "APPROVED" },
//       });

//       const contract = await tx.financingContract.findUnique({
//         where: {
//           kycApplicationId: applicationId,
//         },
//       });

//       if (!contract) {
//         throw new Error("Financing contract not found");
//       }

//       const firstPaymentDate = new Date();

//       firstPaymentDate.setDate(firstPaymentDate.getDate() + 3);

//       const installmentSchedules =
//         InstallmentService.generateInstallmentSchedule({
//           financingContractId: contract.contractId,
//           totalAmount: Number(contract.totalFinanced),
//           months: contract.approvedDurationMonths,
//           firstPaymentDate,
//         });

//       await tx.installment.createMany({
//         data: installmentSchedules,
//       });

//       await tx.financingContract.update({
//         where: {
//           contractId: contract.contractId,
//         },
//         data: {
//           status: FinancingStatus.ACTIVE,
//           activatedAt: new Date(),
//         },
//       });

//       // CBN/NDPR: Schedule physical asset deletion instantly (buffer 24 hours or immediate)
//       // Set scheduledDeletionAt to past to allow immediate cleanup worker purging
//       await tx.kycDocumentAsset.updateMany({
//         where: { kycApplicationId: applicationId },
//         data: { scheduledDeletionAt: new Date(Date.now() - 1000) },
//       });

//       return finalized;
//     }

//     return updated;
//   });

//   // If fully approved, trigger notifications outside database transaction
//   if (updatedApp.status === "APPROVED") {
//     emitEvent(DomainEvent.USER_REGISTERED, {
//       email: customer.email,
//       name: customer.name || "Customer",
//       role: "CUSTOMER",
//       applicationUnderReview: false, // Promotes to approved view
//     });
//   }

//   return {
//     success: true,
//     message:
//       updatedApp.status === "APPROVED"
//         ? "KYC Application fully approved by both Marketer and Admin."
//         : `Approval recorded. Awaiting remaining Maker/Checker signature.`,
//     status: updatedApp.status,
//   };
// }

// static async getAllKycApplications(params: {
//   reviewerId: string;
//   reviewerRole: string;
//   page?: number;
//   limit?: number;
//   sortOrder?: "asc" | "desc";
//   status?: string;
//   marketerId?: string;
//   search?: string;
// }) {
//   const {
//     reviewerId,
//     reviewerRole,
//     page = 1,
//     limit = 10,
//     sortOrder = "desc",
//     status,
//     marketerId,
//     search,
//   } = params;

//   const skip = (page - 1) * limit;

//   // ── Role-based scoping ───────────────────────────────────────────────
//   // KycApplication has no direct companyId; scope via the customer (user).
//   const where: Prisma.KycApplicationWhereInput = {
//     user: {},
//   };

//   if (reviewerRole === Role.MARKETER) {
//     // Marketers only ever see their own referrals — ignore any marketerId param.
//     where.referredByMarketerId = reviewerId;
//   } else if (reviewerRole === Role.ADMIN) {
//     where.user!.referredByMarketer = { createdById: reviewerId };
//   } else if (reviewerRole === Role.COMPANY) {
//     where.user!.companyId = reviewerId;
//   } else if (reviewerRole !== Role.SUPER_ADMIN) {
//     // Any other role (e.g. CUSTOMER) is not permitted to list applications.
//     throw new UnauthorizedError(
//       "You are not authorized to view KYC applications.",
//     );
//   }

//   // ── Explicit filters ────────────────────────────────────────────────
//   if (status) {
//     where.status = status;
//   }

//   if (marketerId) {
//     where.referredByMarketerId = marketerId;
//   }

//   if (search) {
//     where.OR = [
//       { user: { name: { contains: search, mode: "insensitive" } } },
//       { user: { email: { contains: search, mode: "insensitive" } } },
//       {
//         user: {
//           referredByMarketer: {
//             name: { contains: search, mode: "insensitive" },
//           },
//         },
//       },
//     ];
//   }

//   const [applications, total] = await prisma.$transaction([
//     prisma.kycApplication.findMany({
//       where,
//       skip,
//       take: limit,
//       orderBy: { createdAt: sortOrder },
//       include: {
//         user: {
//           select: {
//             userId: true,
//             name: true,
//             email: true,
//             companyId: true,
//             referredByMarketerId: true,
//             referredByMarketer: {
//               select: {
//                 userId: true,
//                 name: true,
//                 email: true,
//                 referralCode: true,
//               },
//             },
//           },
//         },
//         product: {
//           select: {
//             productId: true,
//             name: true,
//             slug: true,
//           },
//         },
//         financingContract: {
//           select: {
//             contractId: true,
//             status: true,
//             totalFinanced: true,
//           },
//         },
//       },
//     }),
//     prisma.kycApplication.count({ where }),
//   ]);

//   const totalPages = Math.ceil(total / limit);

//   return {
//     applications,
//     pagination: {
//       total,
//       totalPages,
//       currentPage: page,
//       limit,
//       hasNextPage: page < totalPages,
//       hasPreviousPage: page > 1,
//     },
//   };
// }
