-- CreateEnum
CREATE TYPE "TripEndReason" AS ENUM ('ARRIVED', 'NEAR_DESTINATION', 'CANCELLED', 'DECLINED', 'MAX_DURATION', 'STOPPED');

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "executor_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" "TripEndReason",
    "last_eta_sec" INTEGER,
    "last_distance_m" INTEGER,
    "last_route_at" TIMESTAMPTZ(3),
    "last_route_polyline" JSONB,
    "last_route_origin_lat" DOUBLE PRECISION,
    "last_route_origin_lng" DOUBLE PRECISION,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_points" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "location" geography(Point, 4326) NOT NULL,
    "accuracy_m" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,

    CONSTRAINT "trip_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_order_id_idx" ON "trips"("order_id");

-- CreateIndex
CREATE INDEX "trips_order_id_ended_at_idx" ON "trips"("order_id", "ended_at");

-- CreateIndex
CREATE INDEX "trip_points_trip_id_at_idx" ON "trip_points"("trip_id", "at");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_points" ADD CONSTRAINT "trip_points_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
