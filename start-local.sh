#!/usr/bin/env bash
# TrustVault — Local dev setup
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
npx tsx scripts/seed-demo.ts 2>/dev/null || echo "  -> Seed skipped (data may already exist from db reset)."

echo ""
echo "========================================"
echo "  Starting Next.js on http://localhost:3000"
echo "  Login: demo@trustvault.dev / demo123456"
echo "========================================"
echo ""
npx supabase status 2>/dev/null | head -3
npm run dev
