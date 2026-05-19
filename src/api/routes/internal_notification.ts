import { Router } from "express";
import { NotificationController } from "../controllers/internal_notification";
import { requireAuth, requireRole } from "@/api/middlewares/auth.guard";
import { Role } from "@/infrastructure/prisma";
const router = Router();

router.use(requireAuth);

router.use(requireAuth);

router.get("/", NotificationController.getNotifications);

router.get("/unread-count", NotificationController.getUnreadCount);

router.patch("/:notificationId/read", NotificationController.markAsRead);

router.patch("/read-selected", NotificationController.markSelectedAsRead);

router.patch("/read-all", NotificationController.markAllAsRead);

export default router;
