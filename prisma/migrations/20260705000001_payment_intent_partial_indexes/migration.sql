-- PR-1 (part 2): partial unique indexes
-- These conditional indexes are not expressible in the Prisma schema DSL, so
-- they are created directly here and are the authoritative race guards.

-- At most one ACTIVE payment intent per reservation key.
-- Covers INITIALIZING, INITIALIZED, PENDING and the new PROCESSING states.
CREATE UNIQUE INDEX "payment_intent_active_reservation"
ON "PaymentIntent" ("reservation_key")
WHERE status IN ('INITIALIZING','INITIALIZED','PENDING','PROCESSING');

-- At most one PENDING CompanySubscription per company at a time.
CREATE UNIQUE INDEX "company_subscription_one_pending"
ON "CompanySubscription" ("companyId")
WHERE status = 'PENDING';
