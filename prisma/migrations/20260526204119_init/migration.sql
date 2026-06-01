-- CreateEnum
CREATE TYPE "MessageTemplateType" AS ENUM ('review_request', 'review_follow_up', 'rebooking_reminder', 'missed_call_recovery', 'win_back');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('sms', 'email');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('review_request', 'review_follow_up', 'rebooking_reminder', 'missed_call_recovery', 'win_back');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('draft', 'queued', 'sent', 'failed', 'replied');

-- CreateEnum
CREATE TYPE "MissedLeadStatus" AS ENUM ('new', 'contacted', 'booked', 'lost');

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "google_review_link" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "last_appointment_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" "MessageTemplateType" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID,
    "channel" "MessageChannel" NOT NULL,
    "type" "MessageType" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'draft',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missed_leads" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "status" "MissedLeadStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missed_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businesses_owner_id_idx" ON "businesses"("owner_id");

-- CreateIndex
CREATE INDEX "customers_business_id_idx" ON "customers"("business_id");

-- CreateIndex
CREATE INDEX "message_templates_business_id_idx" ON "message_templates"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_business_id_type_key" ON "message_templates"("business_id", "type");

-- CreateIndex
CREATE INDEX "messages_business_id_idx" ON "messages"("business_id");

-- CreateIndex
CREATE INDEX "messages_customer_id_idx" ON "messages"("customer_id");

-- CreateIndex
CREATE INDEX "messages_business_id_created_at_idx" ON "messages"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "missed_leads_business_id_idx" ON "missed_leads"("business_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_leads" ADD CONSTRAINT "missed_leads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
