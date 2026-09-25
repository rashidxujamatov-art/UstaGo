-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- PostGIS for order locations and radius search (docs/02-arxitektura.md §2).
-- Needs a superuser, or an extension created beforehand by the DBA (then this is a no-op).
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);
