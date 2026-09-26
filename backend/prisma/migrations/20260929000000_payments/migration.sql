-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYME', 'CLICK', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('TOPUP', 'ORDER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'CANCELLED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CardBrand" AS ENUM ('UZCARD', 'HUMO', 'VISA', 'MASTERCARD');

-- AlterTable
ALTER TABLE "ledger_transactions" ADD COLUMN     "payment_id" UUID;

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "card_id" UUID,
ADD COLUMN     "processed_at" TIMESTAMPTZ(3),
ADD COLUMN     "provider_ref" TEXT;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "created_by" UUID,
    "amount" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "provider_txn_id" TEXT,
    "provider_created_at" TIMESTAMPTZ(3),
    "performed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" INTEGER,
    "card_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "token_enc" BYTEA NOT NULL,
    "masked_pan" TEXT NOT NULL,
    "brand" "CardBrand" NOT NULL,
    "expire" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_seq_key" ON "payments"("seq");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_expires_at_idx" ON "payments"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_txn_id_key" ON "payments"("provider", "provider_txn_id");

-- CreateIndex
CREATE INDEX "cards_user_id_idx" ON "cards"("user_id");

