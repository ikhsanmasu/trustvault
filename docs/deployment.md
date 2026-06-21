# TrustVault — Deployment & Operations (P1)

This document is a **contract** for the `deployment` agent. It specifies the local dev setup, CI configuration, and Vercel deployment process. The `deployment` agent implements CI/CD config from this document; it does not perform manual deploys.

---

## 1. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS or later | Runtime for Next.js and build tooling |
| npm | 10+ (bundled with Node 20) | Package management |
| Supabase CLI | 1.x latest | Local Supabase stack (Postgres + Storage) |
| Docker Desktop | Latest stable | Required by Supabase CLI for local containers |
| Git | Any recent | Source control |

---

## 2. Environment Variables

All environment variables required to run TrustVault. These are **names only** — never commit values.

| Variable | Scope | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public (client + server) | Supabase project URL. For local dev: `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (client + server) | Supabase anon (public) key. Safe to expose to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase service-role key. Grants full DB access. **Never expose to browser.** |
| `DEEPSEEK_API_KEY` | Server-only | DeepSeek API key for AI compare calls. **Never expose to browser.** |

### Local dev (`.env.local`)

Create this file at the project root. It is gitignored and must never be committed.

```
# .env.local — local development only, never commit this file

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
DEEPSEEK_API_KEY=<your DeepSeek API key>
```

The anon key and service-role key for local dev are printed by `supabase start` and are safe to use locally (they do not give access to any production data).

---

## 3. Local Development Setup

### Step 1 — Clone and install

```bash
git clone <repo-url>
cd trustvault
npm install
```

### Step 2 — Initialise and start local Supabase

If the project has not been set up before:
```bash
supabase init
```

Start the local Supabase stack (requires Docker):
```bash
supabase start
```

This will output the local URLs and keys. Copy them into `.env.local` as shown in Section 2.

### Step 3 — Apply the database migration

```bash
supabase db reset
```

This applies all SQL files in `supabase/migrations/` to the local Postgres instance. The migration creates the `documents` table and the `pdf-uploads` storage bucket.

Alternatively, apply the migration directly:
```bash
supabase db push
```

### Step 4 — Start the Next.js dev server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Stopping local Supabase

```bash
supabase stop
```

### Resetting the local database (wipes all data)

```bash
supabase db reset
```

---

## 4. Database Migration Strategy

### P1 migration structure

Single migration file:

```
supabase/
  migrations/
    20260621000000_init.sql   ← create documents table + pdf-uploads bucket
  seed.sql                    ← optional demo data (not required)
```

### Migration file naming

Supabase CLI expects migration file names in the format `{timestamp}_{description}.sql`. The timestamp is UTC in `YYYYMMDDHHMMSS` format.

### Applying migrations

- **Local dev:** `supabase db reset` (wipes and replays all migrations) or `supabase db push` (applies pending migrations).
- **Production:** `supabase db push --db-url <prod-connection-string>` — run this as part of the release process BEFORE deploying the new app version to Vercel.

### Adding new migrations (P2+)

Create a new file: `supabase/migrations/{new_timestamp}_{description}.sql`. Never edit an existing migration file after it has been applied to production.

---

## 5. GitHub Actions CI

### Workflow file

Path: `.github/workflows/ci.yml`

### What the workflow must do

On every `push` to any branch and every `pull_request` targeting `main` or `dev`:

1. Check out the repository.
2. Set up Node.js 20.
3. Run `npm ci` to install dependencies.
4. Run ESLint: `npm run lint` — must exit 0.
5. Run TypeScript type check: `npx tsc --noEmit` — must exit 0.
6. Run Vitest unit tests: `npm run test` — must exit 0.

The workflow fails the check if any step exits non-zero. No deployment happens in CI — CI is lint + typecheck + test only.

### Required `package.json` scripts

The following scripts must exist and work correctly:

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

### GitHub Actions Secrets required for CI

No secrets are needed for the CI lint/typecheck/test workflow in P1, because unit tests in `lib/core.ts` are pure functions with no external dependencies. If integration tests are added later, secrets will be needed.

### Example workflow structure

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main, dev]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test
```

---

## 6. Local Verify Script

Path: `scripts/verify.sh`

The `deployment` agent must create this script. It runs the same checks as CI, for local use before pushing.

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

Make it executable: `chmod +x scripts/verify.sh`

---

## 7. Vercel Deployment

### Build configuration

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Build command | `next build` (Vercel default) |
| Output directory | `.next` (Vercel default) |
| Install command | `npm ci` |
| Node.js version | 20.x |

### Environment variables in Vercel

Set the following in the Vercel project dashboard under **Settings → Environment Variables**. Apply them to all environments (Production, Preview, Development) unless noted.

| Variable | Environments | Sensitivity |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Plain |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Plain |
| `SUPABASE_SERVICE_ROLE_KEY` | All | **Sensitive (secret)** |
| `DEEPSEEK_API_KEY` | All | **Sensitive (secret)** |

`SUPABASE_SERVICE_ROLE_KEY` and `DEEPSEEK_API_KEY` must be marked as **Sensitive** in Vercel so they are not visible in logs.

### Production Supabase project

For production, create a Supabase project at [supabase.com](https://supabase.com) and run the migration:

```bash
supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
```

Use the **production** Supabase project's URL, anon key, and service-role key in Vercel.

### Deployment flow

1. Push to `main` branch → Vercel auto-deploys (after CI passes, if branch protection is configured).
2. Pull requests → Vercel creates preview deployments automatically.

### Deploy script (optional manual deploy)

Path: `scripts/deploy.sh`

```bash
#!/usr/bin/env bash
# Documented manual deploy — normally done automatically by Vercel on push to main.
# Run verify first, then deploy.
set -e

echo "==> Running verify before deploy..."
./scripts/verify.sh

echo "==> Deploying to Vercel..."
npx vercel --prod

echo "==> Deploy complete."
```

---

## 8. Supabase Production Setup Checklist

Performed once when creating the production environment. Not repeated per deploy.

- [ ] Create Supabase project at supabase.com.
- [ ] Run `supabase db push` with the production connection string to apply the `20260621000000_init.sql` migration.
- [ ] Verify the `documents` table exists in the Supabase dashboard.
- [ ] Verify the `pdf-uploads` storage bucket is created with `public = false`.
- [ ] Copy the production Supabase URL, anon key, and service-role key into Vercel environment variables.
- [ ] Copy the DeepSeek API key into Vercel environment variables.

---

## 9. No-Go List for Deployment

- Never push `SUPABASE_SERVICE_ROLE_KEY` or `DEEPSEEK_API_KEY` to the repository.
- Never run `supabase db reset` on the production database (it wipes all data).
- Never deploy to production without CI passing (`npm run lint`, `tsc --noEmit`, `npm run test` must all be green).
- Never run database migrations after the application deploy if the migration introduces breaking schema changes — always migrate first, then deploy.
