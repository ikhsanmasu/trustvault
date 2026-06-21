#!/usr/bin/env bash
# TrustVault — One-command local setup
set -e

echo "========================================"
echo "  TrustVault — Local Dev Setup"
echo "========================================"

# 1. Install deps
echo ""
echo "[1/4] Installing dependencies..."
npm install --silent

# 2. Start Supabase
echo "[2/4] Starting Supabase..."
npx supabase start

# 3. Apply migrations + seed
echo "[3/4] Applying migrations + seed..."
npx supabase db reset

# 4. Seed demo user + sample documents
echo "[4/4] Seeding demo data..."
npx tsx scripts/seed-demo.ts

# 5. Start Next.js
echo ""
echo "========================================"
echo "  Starting Next.js on http://localhost:3000"
echo "  Login: demo@trustvault.dev / demo123456"
echo "========================================"
npm run dev
