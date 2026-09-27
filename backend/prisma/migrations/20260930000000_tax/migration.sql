-- CreateEnum
CREATE TYPE "TaxMethod" AS ENUM ('SELF_EMPLOYED', 'XOLIS');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "executor_profiles" ADD COLUMN     "tax_checked_at" TIMESTAMPTZ(3),
ADD COLUMN     "tax_method" "TaxMethod",
ADD COLUMN     "tax_reminded_for" TIMESTAMPTZ(3),
ADD COLUMN     "tax_reminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tax_valid_until" TIMESTAMPTZ(3),
ADD COLUMN     "xolis_phone" TEXT,
ADD COLUMN     "xolis_qr" TEXT;

-- CreateTable
CREATE TABLE "tax_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" "TaxMethod" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "source" "VerificationSource" NOT NULL,
    "file_key" TEXT,
    "xolis_qr" TEXT,
    "xolis_phone" TEXT,
    "valid_until" TIMESTAMPTZ(3),
    "reviewer_id" UUID,
    "reason" TEXT,
    "checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_verifications_status_created_at_idx" ON "tax_verifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "tax_verifications_user_id_created_at_idx" ON "tax_verifications"("user_id", "created_at");

