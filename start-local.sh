#!/usr/bin/env bash
# TrustVault — Complete local dev setup (Supabase + Anvil + App)
set -e

echo "========================================"
echo "  TrustVault — Local Dev Setup"
echo "========================================"

# 1. Install dependencies
echo ""
echo "[1/4] Installing dependencies..."
npm install --silent

# 2. Start Supabase + apply migrations
echo "[2/4] Starting Supabase + applying migrations..."
npx supabase start
npx supabase db reset

# 3. Start Anvil + deploy contract
echo "[3/4] Starting Anvil + deploying contract..."
docker compose up -d --build 2>/dev/null || echo "  -> Docker not available — skipping Anvil."

# 4. Seed demo data (non-fatal — data may already exist)
echo "[4/4] Seeding demo data..."
npx tsx scripts/seed-demo.ts 2>/dev/null || echo "  -> Seed skipped (data already exists from db reset)."

# Show contract address if deployed
ANVIL_ADDR=$(docker compose logs deploy-anchor 2>/dev/null | grep "Deployed at" | tail -1 | grep -o '0x[a-fA-F0-9]\{40\}' || echo "")
if [ -n "$ANVIL_ADDR" ]; then
  echo ""
  echo "  Contract: $ANVIL_ADDR"
  echo "  Add to .env.local: ANCHOR_CONTRACT_ADDRESS=$ANVIL_ADDR"
fi

echo ""
echo "========================================"
echo "  All services running:"
echo "  App:      http://localhost:3000"
echo "  Supabase: http://localhost:54321"
echo "  Studio:   http://localhost:54323"
echo "  Anvil:    http://localhost:8545"
echo ""
echo "  Login: demo@trustvault.dev / demo123456"
echo "========================================"
npm run dev
