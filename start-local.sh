#!/usr/bin/env bash
# TrustVault — Local dev setup (Supabase + App; blockchain anchoring optional)
set -e

echo "========================================"
echo "  TrustVault — Local Dev Setup"
echo "========================================"

# 1. Install dependencies
echo ""
echo "[1/3] Installing dependencies..."
npm install --silent

# 2. Start Supabase + apply migrations
echo "[2/3] Starting Supabase + applying migrations..."
npx supabase start
npx supabase db reset

# 3. Seed demo data (non-fatal — data may already exist)
echo "[3/3] Seeding demo data..."
npx tsx scripts/seed-demo.ts 2>/dev/null || echo "  -> Seed skipped (data already exists from db reset)."

echo ""
echo "========================================"
echo "  All services running:"
echo "  App:      http://localhost:3000"
echo "  Supabase: http://localhost:54321"
echo "  Studio:   http://localhost:54323"
echo ""
echo "  Optional — blockchain anchoring (needs Foundry):"
echo "    anvil &"
echo "    npx tsx scripts/deploy-anchor.ts"
echo "    # then set ANCHOR_CONTRACT_ADDRESS in .env.local"
echo ""
echo "  Login: demo@trustvault.dev / demo123456"
echo "========================================"
npm run dev
