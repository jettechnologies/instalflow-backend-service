-- DropIndex
DROP INDEX "KycApplication_status_idx";

-- CreateIndex
CREATE INDEX "KycApplication_status_created_at_idx" ON "KycApplication"("status", "created_at");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_referredByMarketerId_idx" ON "User"("referredByMarketerId");

-- CreateIndex
CREATE INDEX "User_createdById_idx" ON "User"("createdById");
