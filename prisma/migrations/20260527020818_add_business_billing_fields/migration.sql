-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('starter', 'pro', 'scale');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "current_period_start" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "message_quota_limit" INTEGER NOT NULL DEFAULT 250,
ADD COLUMN     "plan" "BillingPlan" NOT NULL DEFAULT 'starter',
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "stripe_subscription_id" TEXT;
