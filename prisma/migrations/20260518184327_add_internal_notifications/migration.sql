-- DropIndex
DROP INDEX "product_search_idx";

-- CreateTable
CREATE TABLE "InternalNotification" (
    "id" BIGSERIAL NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InternalNotification_notification_id_key" ON "InternalNotification"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "InternalNotification_idempotency_key_key" ON "InternalNotification"("idempotency_key");

-- AddForeignKey
ALTER TABLE "InternalNotification" ADD CONSTRAINT "InternalNotification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
