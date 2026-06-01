-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "sms_opted_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sms_opted_out_at" TIMESTAMPTZ(6);
