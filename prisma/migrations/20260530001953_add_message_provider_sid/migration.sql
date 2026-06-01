-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "provider_sid" TEXT;

-- CreateIndex
CREATE INDEX "messages_provider_sid_idx" ON "messages"("provider_sid");
