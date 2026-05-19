import {
  prisma,
  InternalNotificationStatus,
  InternalNotificationType,
  type Prisma,
} from "../prisma";

type PrismaTransactionClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use"
>;

interface CreateNotificationDTO {
  userId: string;
  type: InternalNotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey?: string;
}

interface NotificationFilters {
  userId: string;
  status?: InternalNotificationStatus;
  type?: InternalNotificationType;
}

export class NotificationRepository {
  static async create(
    data: CreateNotificationDTO,
    tx?: PrismaTransactionClient,
  ) {
    const db = (tx ?? prisma) as PrismaTransactionClient;

    if (!data.idempotencyKey) {
      return db.internalNotification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          metadata: data.metadata,
        },
      });
    }

    return db.internalNotification.upsert({
      where: {
        idempotencyKey: data.idempotencyKey,
      },
      update: {},
      create: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata,
        idempotencyKey: data.idempotencyKey,
      },
    });
  }

  static async createMany(
    notifications: CreateNotificationDTO[],
    tx?: PrismaTransactionClient,
  ) {
    const db = tx ?? prisma;

    return db.internalNotification.createMany({
      data: notifications.map((notification) => ({
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        idempotencyKey: notification.idempotencyKey,
      })),
      skipDuplicates: true,
    });
  }

  static async findById(userId: string, notificationId: string) {
    return prisma.internalNotification.findFirst({
      where: {
        userId,
        notificationId,
      },
    });
  }

  static async findMany(filters: NotificationFilters, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: Prisma.InternalNotificationWhereInput = {
      userId: filters.userId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    const [notifications, total] = await prisma.$transaction([
      prisma.internalNotification.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),

      prisma.internalNotification.count({
        where,
      }),
    ]);

    return {
      notifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async countUnread(userId: string) {
    return prisma.internalNotification.count({
      where: {
        userId,
        status: "UNREAD",
      },
    });
  }

  static async markAsRead(
    userId: string,
    notificationId: string,
    tx?: PrismaTransactionClient,
  ) {
    const db = tx ?? prisma;

    return db.internalNotification.updateMany({
      where: {
        userId,
        notificationId,
        status: "UNREAD",
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
  }

  static async markManyAsRead(
    userId: string,
    notificationIds: string[],
    tx?: PrismaTransactionClient,
  ) {
    const db = tx ?? prisma;

    return db.internalNotification.updateMany({
      where: {
        userId,
        notificationId: {
          in: notificationIds,
        },
        status: "UNREAD",
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
  }

  static async markAllAsRead(userId: string, tx?: PrismaTransactionClient) {
    const db = tx ?? prisma;

    return db.internalNotification.updateMany({
      where: {
        userId,
        status: "UNREAD",
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
  }

  static async archive(userId: string, notificationId: string) {
    return prisma.internalNotification.updateMany({
      where: {
        userId,
        notificationId,
      },
      data: {
        status: "ARCHIVED",
      },
    });
  }
}
