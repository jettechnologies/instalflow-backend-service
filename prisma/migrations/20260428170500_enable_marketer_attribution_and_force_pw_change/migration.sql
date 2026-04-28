-- AlterTable
ALTER TABLE "User" ADD COLUMN     "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referredByMarketerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByMarketerId_fkey" FOREIGN KEY ("referredByMarketerId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
