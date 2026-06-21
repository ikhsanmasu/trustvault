# TrustVault -- Deployment & Operations (P2)

This document is a **contract** for the `deployment` agent. It specifies the local dev setup, CI configuration, Supabase Auth configuration, and Vercel deployment process. P1 deployment sections that remain valid are noted as preserved.

---

## 1. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS or later | Runtime for Next.js and build tooling |
| npm | 10+ (bundled with Node 20) | Package management |
| Supabase CLI | 1.x latest | Local Supabase stack (Postgres + Storage + Auth) |
| Docker Desktop | Latest stable | Required by Supabase CLI for local containers |
| Git | Any recent | Source control |

### New P2 Dependency

| Package | Version | Purpose |
|---|---|---|
| `@supabase/ssr` | ^0.5.x (latest compatible) | Server-side Supabase auth with cookie management for Next.js App Router |

This package must be added to `package.json` by the `scaffold` agent before build agents start.

---

## 2. Environment Variables

All environment variables required to run TrustVault. These are **names only** -- never commit values.

| Variable | Scope | Description | P2 Change |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public (client + server) | Supabase project URL. Local dev: `http://127.0.0.1:54321` | Now also used by browser Supabase client for auth. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (client + server) | Supabase anon (public) key. Safe to expose. | Now used by browser for auth API calls. Still safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase service-role key. **Usage restricted in P2** to admin ops (profile creation trigger, backfills). | No new var; usage scope reduced. |
| `DEEPSEEK_API_KEY` | Server-only | DeepSeek API key for AI compare. | No change. |

**No new environment variables are required for P2.** The existing four variables cover all P2 functionality. Supabase Auth does not require additional API keys -- the anon key and service-role key are sufficient.

### Local dev (`.env.local`)

Create this file at the project root. It is gitignored. The file format is unchanged from P1.

```
# .env.local -- local development only, never commit this file

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
DEEPSEEK_API_KEY=<your DeepSeek API key>
```

After `supabase start`, the output will include `anon key` and `service_role key`. These keys work for local auth (Supabase Auth runs locally as part of the CLI stack). Users can sign up, sign in, and receive JWT tokens that are validated against the local Supabase instance.

---

## 3. Local Development Setup

### Step 1 -- Clone and install

```bash
git clone <repo-url>
cd trustvault
npm install
```

### Step 2 -- Initialise and start local Supabase

```bash
supabase init        # if not already initialised
supabase start       # starts Postgres, Auth, Storage locally (requires Docker)
```

The output shows the local URLs and keys. Copy them into `.env.local`.

### Step 3 -- Apply database migrations

```bash
supabase db reset
```

This applies all SQL files in `supabase/migrations/` in order:
1. `20260621000000_init.sql` (P1: documents table + storage bucket)
2. `20260621000001_p2_auth_rbac.sql` (P2: tenants, profiles, projects, project_members, RLS policies, trigger)

### Step 4 -- Start the Next.js dev server

```bash
npm run dev
```

The app is available at `http://localhost:3000`.

### Step 5 -- Verify local Supabase Auth

- Open the Supabase Studio at `http://127.0.0.1:54323` (printed by `supabase start`).
- Navigate to **Authentication > Users** to see registered users.
- The `on_auth_user_created` trigger auto-creates the corresponding `profiles` and `tenants` rows when a user signs up.

### Stopping

```bash
supabase stop    # stops the local Supabase stack
```

### Resetting

```bash
supabase db reset   # wipes and replays all migrations
```

---

## 4. Database Migration Strategy (Updated for P2)

### P2 migration structure

```
supabase/
  migrations/
    20260621000000_init.sql            ← P1: create documents table + bucket (DO NOT EDIT)
    20260621000001_p2_auth_rbac.sql    ← P2: tenants, profiles, projects, project_members,
                                          update documents, RLS policies, auth trigger
  seed.sql                              ← optional demo data
```

### Applying migrations

- **Local dev:** `supabase db reset` (wipes and replays all) or `supabase db push` (applies pending only).
- **Production:** `supabase db push --db-url <prod-connection-string>`.

**Rule:** Run database migrations **before** deploying the new application version. The P2 migration adds NOT NULL constraints on `documents.tenant_id` and `documents.project_id`. If the new application version is deployed first, existing P1 route handlers that insert without those columns will fail.

### Production migration checklist

- [ ] Run `supabase db push` with the production connection string.
- [ ] Verify new tables exist: `tenants`, `profiles`, `projects`, `project_members`.
- [ ] Verify RLS is enabled on all tables (check Supabase Dashboard > Authentication > Policies).
- [ ] Verify the `on_auth_user_created` trigger exists in the Database > Triggers section.
- [ ] Verify existing `documents` rows (if any) were backfilled with NOT NULL tenant_id and project_id.

---

## 5. Supabase Auth Configuration (NEW for P2)

### 5a. Production Supabase Project Settings

In the Supabase Dashboard for the production project, configure the following under **Authentication > Settings**:

#### Site URL

| Setting | Value |
|---|---|
| Site URL | `https://{your-vercel-domain}.vercel.app` (production Vercel URL) |

This must match the exact production URL. It is used for redirect URLs and email templates.

#### Redirect URLs (allowed)

Add these redirect URLs. Supabase Auth will only redirect to URLs in this list after email confirmation or password reset.

| URL | Purpose |
|---|---|
| `https://{your-vercel-domain}.vercel.app/**` | Production app |
| `http://localhost:3000/**` | Local development |

The `**` wildcard allows any path under the domain. For stricter security, list specific paths: `/auth/callback`, `/auth/reset-password`.

#### Email Auth Configuration

| Setting | Value | Notes |
|---|---|---|
| Enable email confirmations | `true` (recommended) | Users must verify email before signing in. Disable for demo if needed. |
| Confirm email link | Default Supabase template | Customise if branding is needed. |

#### Email Templates (Supabase Dashboard > Authentication > Email Templates)

Update the **Confirm signup** template to point to the correct Vercel URL. The default template works but uses the Supabase project URL -- replace with your Vercel URL if custom branding is desired. Not required for a working system.

**Minimal P2 configuration:** Only the Site URL and Redirect URLs must be set. All other Supabase Auth defaults work out of the box.

### 5b. Local Auth Configuration

The local Supabase CLI (`supabase start`) runs a local Auth service with development defaults. No manual configuration is needed. The local Site URL is `http://localhost:3000` by default.

Configuration for local Auth can be set in `supabase/config.toml`:

```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**"]

[auth.email]
enable_confirmations = false   # easy local dev
```

This `config.toml` file is managed by the Supabase CLI and is not part of the application build.

### 5c. Auth Flow in Vercel Preview Deployments

Vercel preview deployments use auto-generated URLs (e.g. `https://project-git-branch.vercel.app`). For Auth to work in preview deployments, add a wildcard redirect URL for Vercel previews: `https://*.vercel.app/**`.

**Note:** This is a permissive setting. For production-only deployments, keep the redirect URL list tight. The wildcard is convenient for PR previews during development.

---

## 6. GitHub Actions CI (Updated for P2)

### Workflow File

Path: `.github/workflows/ci.yml`

### What the workflow must do (unchanged from P1)

On every `push` and `pull_request` to `main` or `dev`:

1. Checkout repository.
2. Set up Node.js 20.
3. `npm ci` (installs dependencies including `@supabase/ssr`).
4. `npm run lint` -- must exit 0.
5. `npx tsc --noEmit` -- must exit 0.
6. `npm run test` -- must exit 0.

### P2 Note on Unit Tests

Unit tests in `lib/core.test.ts` test pure functions only and do not require auth. The `lib/core.ts` functions are unchanged. Integration tests for auth flows are NOT in CI scope for P2 (they require a running Supabase instance). The `qa` agent may add E2E/auth tests separately.

### Required `package.json` scripts (unchanged)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

### GitHub Actions Secrets

No new secrets are required for CI in P2. The lint/typecheck/test steps do not connect to Supabase.

---

## 7. Local Verify Script (Unchanged from P1)

Path: `scripts/verify.sh`

The `deployment` agent must create/update this script to verify the P2 build locally:

```bash
#!/usr/bin/env bash
set -e

echo "==> Lint"
npm run lint

echo "==> Typecheck"
npx tsc --noEmit

echo "==> Tests"
npm run test

echo "==> All checks passed."
```

Make executable: `chmod +x scripts/verify.sh`

---

## 8. Vercel Deployment (Updated for P2)

### Build Configuration (unchanged)

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Build command | `next build` (Vercel default) |
| Output directory | `.next` (Vercel default) |
| Install command | `npm ci` |
| Node.js version | 20.x |

### Environment Variables in Vercel

Set these in the Vercel project dashboard under **Settings > Environment Variables**. Apply to all environments (Production, Preview, Development).

| Variable | Environments | Sensitivity | P2 Change |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Plain | Must be the **production** Supabase URL for production deploys, localhost for local. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Plain | Must be the **production** Supabase anon key for production. |
| `SUPABASE_SERVICE_ROLE_KEY` | All | **Sensitive (secret)** | Must be the **production** Supabase service-role key. |
| `DEEPSEEK_API_KEY` | All | **Sensitive (secret)** | Unchanged. |

For Vercel preview deployments, use the same production Supabase credentials. In P2, this means preview deployments share the same database and users as production (not isolated). For stricter environments, create a separate Supabase project for staging.

### Production Supabase Project

Create a Supabase project at [supabase.com](https://supabase.com) and run migrations:

```bash
supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
```

This applies both P1 and P2 migrations.

### Pre-Deploy Checklist (Ordered)

1. **Migrate database first:** `supabase db push` to production.
2. **Configure Supabase Auth** (Section 5): Set Site URL and Redirect URLs in the Supabase Dashboard.
3. **Set Vercel environment variables** (Section 8).
4. **Push to main** to trigger Vercel deploy.
5. **Verify:** Sign up a test user, create a project, upload a document, trigger a compare.

**Never deploy the application before migrating the database** -- the new application expects `documents.tenant_id` and `documents.project_id` to be NOT NULL and the new tables to exist.

### Deployment Flow

1. Push to `main` branch -> Vercel auto-deploys (after CI passes).
2. Pull requests -> Vercel creates preview deployments automatically.

---

## 9. Supabase Production Setup Checklist (Updated for P2)

Performed once when creating the production environment. Not repeated per deploy.

- [ ] Create Supabase project at supabase.com.
- [ ] Run `supabase db push` with the production connection string (applies both P1 and P2 migrations).
- [ ] **Verify RLS is enabled** on all tables: `tenants`, `profiles`, `projects`, `project_members`, `documents`. Check **Authentication > Policies** in the Supabase Dashboard.
- [ ] **Verify the `on_auth_user_created` trigger** exists (Database > Triggers).
- [ ] **Configure Auth settings:** Site URL and Redirect URLs (Section 5).
- [ ] Verify the `documents` table has the new columns (`tenant_id` NOT NULL, `project_id` NOT NULL, `uploaded_by` NOT NULL) and FK constraints.
- [ ] Verify the `pdf-uploads` storage bucket is created with `public = false`.
- [ ] Copy the production Supabase URL, anon key, and service-role key into Vercel environment variables.
- [ ] Copy the DeepSeek API key into Vercel environment variables.

---

## 10. No-Go List (Updated for P2)

All P1 "No-Go" items remain. P2 adds:

- Never deploy the application before running the P2 database migration.
- Never edit the P1 migration file (`20260621000000_init.sql`) -- all P2 changes go in the P2 migration.
- Never run `supabase db reset` on the production database.
- Never use the production service-role key in local development.
- Never set `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` -- the service-role key must never be prefixed with `NEXT_PUBLIC_`.
- Never configure Supabase Auth Site URL to `localhost` for the production project -- use the actual Vercel domain.

---

## 11. P1 Baseline (Preserved)

All P1 deployment steps remain valid and are incorporated above. The P1 deployment document Sections 2-8 are the foundation that P2 extends. Key preserved items:
- Local dev setup with Supabase CLI.
- Migration naming convention and apply process.
- GitHub Actions CI workflow.
- Vercel build configuration.
- Deploy script (`scripts/deploy.sh`).
