#!/bin/sh
set -e
cd /app
echo "==> Installing dependencies..."
npm install --silent

echo "==> Running migrations..."
for f in /app/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  PGPASSWORD=postgres psql -h supabase-db -U postgres -f "$f" 2>/dev/null || true
done

echo "==> Running seed..."
PGPASSWORD=postgres psql -h supabase-db -U postgres -f /app/supabase/seed.sql 2>/dev/null || true

echo "==> Starting Next.js..."
exec npm run dev
