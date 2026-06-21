#!/usr/bin/env bash
# Documented, reproducible deploy helper for TrustVault.
# Normally deployed automatically by Vercel on push to main.
# Run verify first, then deploy. Migrations must be applied before deploy.
set -e

# ---------------------------------------------------------------------------
# Pre-deploy checklist (human steps -- not automated)
#
# 1. RUN DATABASE MIGRATIONS FIRST (Never deploy app before migrations):
#
#    --- PRIMARY METHOD: Supabase GitHub Auto-Deploy (recommended) ---
#
#    Supabase can auto-apply migrations on every push to a linked GitHub
#    branch. This eliminates the manual copy-paste-to-SQL-Editor step.
#
#    Setup (one-time, in Supabase Dashboard):
#      a. Go to your Supabase project Dashboard
#      b. Navigate: Settings → Integrations → GitHub
#      c. Click "Connect" and authorise Supabase to access the repository
#      d. Select the repository (e.g. ikhsanmasu/trustvault)
#      e. Select the branch to watch (dev or main)
#      f. Click "Save" or "Connect branch"
#
#    Once connected, Supabase automatically:
#      - Detects new .sql files in supabase/migrations/ on push
#      - Applies them to the linked Supabase project in timestamp order
#      - Reports success/failure in the Supabase Dashboard under
#        Settings → Integrations → GitHub → Run History
#
#    --- FALLBACK: Manual CLI push ---
#
#    If GitHub integration is not configured, use the CLI:
#      - Local dev:   supabase db reset
#      - Production:  npx supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
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
# P4 migration files (applied in order):
#   supabase/migrations/20260621000000_init.sql           (P1: documents + storage)
#   supabase/migrations/20260621000001_p2_auth_rbac.sql   (P2: tenants, profiles, projects, RLS, trigger)
#   supabase/migrations/20260621000002_p3_multiformat.sql (P3: multi-format file_type, storage RLS)
#   supabase/migrations/20260621000003_p4_soft_delete.sql (P4: soft delete, deleted_at/deleted_by columns)
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
echo "==> Checking Supabase GitHub integration..."
echo ""
echo "    Recommended: Supabase auto-deploys migrations when connected to GitHub."
echo "    Setup: Supabase Dashboard → Settings → Integrations → GitHub → Connect."
echo "    Select the repository and branch (dev or main)."
echo "    After connecting, new migration files in supabase/migrations/ are auto-applied on push."
echo "    Verify: Settings → Integrations → GitHub → Run History."
echo ""
echo "    Fallback: If not using GitHub integration, run migrations manually:"
echo "      npx supabase db push --db-url <prod-connection-string>"
echo ""

echo "==> WARNING: Ensure database migrations are applied before deploy."
echo "    P4 migration adds soft delete columns (deleted_at, deleted_by) to the documents table."
echo "    Without this migration, P4 delete/restore endpoints will fail."
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
echo ""
echo "==> P4: verify soft delete columns exist on the documents table:"
echo "    - deleted_at timestamptz NULL"
echo "    - deleted_by uuid NULL"
echo "    - documents_deleted_at_idx index"
echo ""
