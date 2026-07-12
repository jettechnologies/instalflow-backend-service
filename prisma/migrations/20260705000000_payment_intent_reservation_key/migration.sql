-- PR-1 (part 1): reservationKey column + backfill + PROCESSING enum value
-- The reservationKey is NOT NULL in the schema; we add it nullable first,
-- backfill from existing rows, then enforce NOT NULL so the column constraint
-- holds for the partial unique index added in the next migration.

-- 1. Add the column as nullable to permit backfill of existing rows.
ALTER TABLE "PaymentIntent" ADD COLUMN "reservation_key" TEXT;

-- 2. Backfill: <type>:<installmentId | companyId | onboardingId | intentId>
UPDATE "PaymentIntent"
SET "reservation_key" = "type" || ':' || COALESCE("installmentId", "companyId", "onboardingId", "intentId");

-- 3. Enforce NOT NULL now that every row is populated.
ALTER TABLE "PaymentIntent" ALTER COLUMN "reservation_key" SET NOT NULL;

-- 3b. Plain B-tree index on reservation_key, matching the Prisma schema's
--     @@index([reservationKey]) ("PaymentIntent_reservationKey_idx").
--     Created here because the column itself is introduced in this migration.
CREATE INDEX "PaymentIntent_reservationKey_idx" ON "PaymentIntent" ("reservation_key");

-- 4. Add the PROCESSING status between PENDING and SUCCESS.
--    (PostgreSQL 12+ allows ADD VALUE inside a migration transaction; the new
--     value is first referenced by the index predicate in the next migration.)
ALTER TYPE "PaymentInitStatus" ADD VALUE 'PROCESSING';
