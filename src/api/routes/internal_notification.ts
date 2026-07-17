import { Router } from "express";
import { NotificationController } from "../controllers/internal_notification";
import { requireAuth } from "@/api/middlewares/auth.guard";

const router = Router();

router.use(requireAuth);

router.get("/", NotificationController.getNotifications);

router.get("/unread-count", NotificationController.getUnreadCount);

router.patch("/:notificationId/read", NotificationController.markAsRead);

router.patch("/read-selected", NotificationController.markSelectedAsRead);

router.patch("/read-all", NotificationController.markAllAsRead);

export default router;
