#!/usr/bin/env bash
# Documented, reproducible deploy helper for TrustVault.
# Normally deployed automatically by Vercel on push to main.
# Run verify first, then deploy. Migrations must be applied before deploy.
set -e

# ---------------------------------------------------------------------------
# Pre-deploy checklist (human steps -- not automated)
#
# 1. RUN DATABASE MIGRATIONS FIRST (Never deploy app before migrations):
#    - Local dev:   supabase db reset
#    - Production:  npx supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
#
# 2. VERIFY SUPABASE AUTH CONFIGURATION (Supabase Dashboard):
#    - Site URL:        https://<your-vercel-domain>.vercel.app
#    - Redirect URLs:   https://<your-vercel-domain>.vercel.app/**
#                       http://localhost:3000/**
#    - Email confirmations: enabled (recommended for production)
#
# 3. SET VERCEL ENVIRONMENT VARIABLES (Settings > Environment Variables):
#
#    NEXT_PUBLIC_SUPABASE_URL       (plain)    Production Supabase project URL
#    NEXT_PUBLIC_SUPABASE_ANON_KEY  (plain)    Production Supabase anon/public key
#    SUPABASE_SERVICE_ROLE_KEY      (secret)   Production Supabase service-role key (server-only)
#    DEEPSEEK_API_KEY               (secret)   DeepSeek API key for AI compare
#
#    WARNING: Never prefix SUPABASE_SERVICE_ROLE_KEY with NEXT_PUBLIC_.
#             It MUST remain server-only.
#
# 4. PUSH TO MAIN to trigger Vercel auto-deploy (CI must pass first).
#
# 5. POST-DEPLOY VERIFY:
#    - Sign up a test user
#    - Create a project
#    - Upload a document
#    - Trigger a compare
#
# P2 migration files (applied in order):
#   supabase/migrations/20260621000000_init.sql           (P1: documents + storage)
#   supabase/migrations/20260621000001_p2_auth_rbac.sql   (P2: tenants, profiles, projects, RLS, trigger)
# ---------------------------------------------------------------------------

echo "==> Checking required env vars..."
REQUIRED_VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  DEEPSEEK_API_KEY
)

MISSING=0
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "    WARNING: $VAR is not set. Set it in your .env.local for local dev, or in Vercel for production."
    MISSING=1
  else
    echo "    OK: $VAR"
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "    Some env vars are missing. Local dev requires .env.local with all four variables."
  echo "    Production requires these variables set in Vercel Settings > Environment Variables."
  echo "    For guidance, see .env.example in the project root."
  echo ""
fi

echo ""
echo "==> WARNING: Ensure database migrations are applied before deploy."
echo "    Production: npx supabase db push --db-url <prod-connection-string>"
echo "    Local dev:  supabase db reset"
echo ""

echo "==> Running verify before deploy..."
./scripts/verify.sh

echo ""
echo "==> Deploying to Vercel..."
npx vercel --prod

echo ""
echo "==> Deploy complete."
echo ""
echo "==> Post-deploy: verify RLS is enabled on all tables in the Supabase Dashboard."
echo "    Check: tenants, profiles, projects, project_members, documents."
echo "    Also verify the on_auth_user_created trigger exists."
