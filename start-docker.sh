#!/usr/bin/env bash
# TrustVault — Docker setup (Supabase via CLI + Anvil + App via Compose)
set -e

echo "========================================"
echo "  TrustVault — Docker Dev Setup"
echo "========================================"

# 1. Start Supabase
echo ""
echo "[1/3] Starting Supabase..."
npx supabase start

# 2. Apply migrations + seed
echo "[2/3] Applying migrations + seed..."
npx supabase db reset
npx tsx scripts/seed-demo.ts

# 3. Start Docker services (Anvil + App)
echo "[3/3] Starting Docker services..."
docker compose up -d

echo ""
echo "========================================"
echo "  All services running:"
echo "  App:     http://localhost:3000"
echo "  Anvil:   http://localhost:8545"
echo "  Supabase: http://localhost:54321"
echo "  Studio:  http://localhost:54323"
echo ""
echo "  Login: demo@trustvault.dev / demo123456"
echo "========================================"
