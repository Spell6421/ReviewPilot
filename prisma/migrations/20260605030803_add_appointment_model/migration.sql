-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "service" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_business_id_idx" ON "appointments"("business_id");

-- CreateIndex
CREATE INDEX "appointments_customer_id_date_idx" ON "appointments"("customer_id", "date");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one seed appointment per customer with a known last visit (D-06).
-- source = 'backfill', service = NULL, date = the legacy last_appointment_at.
-- After this, the D-04 invariant already holds for legacy rows (their existing
-- last_appointment_at equals MAX of their single seed appointment), so no UPDATE
-- of "customers" is required.
INSERT INTO "appointments" ("id", "business_id", "customer_id", "date", "service", "source", "created_at")
SELECT gen_random_uuid(), c."business_id", c."id", c."last_appointment_at", NULL, 'backfill', CURRENT_TIMESTAMP
FROM "customers" c
WHERE c."last_appointment_at" IS NOT NULL;
