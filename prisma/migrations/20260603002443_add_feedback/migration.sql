-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID,
    "token" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_token_key" ON "feedback"("token");

-- CreateIndex
CREATE INDEX "feedback_business_id_idx" ON "feedback"("business_id");

-- CreateIndex
CREATE INDEX "feedback_customer_id_idx" ON "feedback"("customer_id");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
