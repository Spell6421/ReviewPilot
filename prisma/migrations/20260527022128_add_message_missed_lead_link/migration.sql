-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "missed_lead_id" UUID;

-- CreateIndex
CREATE INDEX "messages_missed_lead_id_idx" ON "messages"("missed_lead_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_missed_lead_id_fkey" FOREIGN KEY ("missed_lead_id") REFERENCES "missed_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
