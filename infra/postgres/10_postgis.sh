#!/bin/sh
# Runs once, when the data volume is empty. Installs only the PostGIS extension
# into the application database. The same statement is in the first Prisma
# migration, so staging/production databases get it through migrations too.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
	CREATE EXTENSION IF NOT EXISTS postgis;
EOSQL
