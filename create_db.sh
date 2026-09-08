#!/bin/sh
# create_db.sh — สร้าง database + user สำหรับรันโปรเจคครั้งแรกใน Docker
# ใช้กรณี volume เก่าหรือต้องการรันแยกจาก compose

set -e

DB_NAME="${DB_NAME:-mena_ai}"
DB_USER="${DB_USER:-mena_ai}"
DB_PASS="${DB_PASS:-mena_ai}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."

# รอให้ postgres พร้อม (max 30 ครั้ง)
retries=30
until PGPASSWORD=postgres psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c '\q' 2>/dev/null; do
  retries=$((retries - 1))
  if [ $retries -le 0 ]; then
    echo "❌ PostgreSQL not ready after 30s"
    exit 1
  fi
  sleep 1
done

echo "✅ PostgreSQL is ready"

# สร้าง user ถ้ายังไม่มี
PGPASSWORD=postgres psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  PGPASSWORD=postgres psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c \
  "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

# สร้าง database ถ้ายังไม่มี
PGPASSWORD=postgres psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  PGPASSWORD=postgres psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c \
  "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "✅ Database '$DB_NAME' and user '$DB_USER' are ready"
