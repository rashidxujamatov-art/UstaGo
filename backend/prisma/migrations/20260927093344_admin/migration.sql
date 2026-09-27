-- CreateEnum
CREATE TYPE "DisputeDecision" AS ENUM ('FULL', 'PARTIAL', 'CANCEL');

-- CreateEnum
CREATE TYPE "DisputeApproval" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PermissionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BroadcastTarget" AS ENUM ('ALL', 'CUSTOMER', 'EXECUTOR');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('QUEUED', 'SENDING', 'DONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CancelReason" ADD VALUE 'DISPUTE';
ALTER TYPE "CancelReason" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dispute_approval" "DisputeApproval" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "dispute_approved_at" TIMESTAMPTZ(3),
ADD COLUMN     "dispute_approved_by" UUID,
ADD COLUMN     "dispute_decided_at" TIMESTAMPTZ(3),
ADD COLUMN     "dispute_decided_by" UUID,
ADD COLUMN     "dispute_decision" "DisputeDecision",
ADD COLUMN     "dispute_decision_note" TEXT,
ADD COLUMN     "dispute_executed_at" TIMESTAMPTZ(3),
ADD COLUMN     "dispute_original_price" BIGINT,
ADD COLUMN     "dispute_reject_reason" TEXT;

-- CreateTable
CREATE TABLE "permission_requests" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "note" TEXT,
    "status" "PermissionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "target" "BroadcastTarget" NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients_count" INTEGER NOT NULL DEFAULT 0,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'QUEUED',

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permission_requests_status_idx" ON "permission_requests"("status");

-- CreateIndex
CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts"("created_at");

-- AddForeignKey
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
