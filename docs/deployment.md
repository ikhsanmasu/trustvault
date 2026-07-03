# TrustVault -- Deployment & Operations (P5)

This document is a **contract** for the `deployment` agent. It specifies the local dev setup, CI configuration, Supabase Auth configuration, Supabase GitHub integration, Vercel deployment process, blockchain node setup (Anvil/Railway), and contract deployment. P1-P4 deployment sections that remain valid are noted as preserved.

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
2. `20260621000001_p2_auth_rbac.sql` (P2: tenants, profiles, RLS policies, trigger)
3. `20260621000002_p3_multiformat.sql` (P3: multi-format file_type column, storage RLS)
4. `20260621000003_p4_soft_delete.sql` (P4: soft delete, deleted_at/deleted_by columns)

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

## 4. Database Migration Strategy (Updated for P4)

### P4 migration structure (updated for P5)

```
supabase/
  migrations/
    20260621000000_init.sql            ← P1: create documents table + bucket (DO NOT EDIT)
    20260621000001_p2_auth_rbac.sql    ← P2: tenants, profiles,
                                          update documents, RLS policies, auth trigger
    20260621000002_p3_multiformat.sql  ← P3: multi-format support, file_type column,
                                          storage RLS policy update
    20260621000003_p4_soft_delete.sql  ← P4: soft delete, deleted_at/deleted_by columns,
                                          documents_deleted_at_idx index
    20260622000000_p5_blockchain_anchor.sql  ← P5: anchoring columns (fingerprint, chain,
                                                tx_hash, anchored_at), unique constraint,
                                                UPDATE RLS policy
  seed.sql                              ← optional demo data
```

### Applying migrations

- **Local dev:** `supabase db reset` (wipes and replays all) or `supabase db push` (applies pending only).
- **Production (primary):** Supabase GitHub auto-deploy. Once connected (Section 4a), new migration files pushed to the linked branch are automatically applied in timestamp order. No manual CLI command needed.
- **Production (fallback):** `supabase db push --db-url <prod-connection-string>`.

**Rule:** Run database migrations **before** deploying the new application version. The P4 migration adds `deleted_at` and `deleted_by` columns to the `documents` table. If the new application version is deployed first, P4 delete/restore endpoints will fail with missing column errors.

### Production migration checklist

- [ ] Run `supabase db push` with the production connection string, or verify Supabase GitHub auto-deploy applied migrations (Settings → Integrations → GitHub → Run History).
- [ ] Verify new P4 columns exist on `documents` table: `deleted_at timestamptz NULL`, `deleted_by uuid NULL`.
- [ ] Verify the `documents_deleted_at_idx` index exists.
- [ ] Verify existing tables still intact: `tenants`, `profiles`.
- [ ] Verify RLS is enabled on all tables (check Supabase Dashboard > Authentication > Policies).
- [ ] Verify the `on_auth_user_created` trigger exists in the Database > Triggers section.
- [ ] Verify existing `documents` rows (if any) were backfilled with NOT NULL tenant_id.

---

### 4a. Supabase GitHub Auto-Deploy (NEW for P4)

Supabase can automatically apply migrations on every push to a linked GitHub branch. This eliminates the manual `supabase db push` step for production and ensures the database is always in sync with the code.

#### Setup (one-time, in Supabase Dashboard)

1. Open your Supabase project Dashboard at [supabase.com](https://supabase.com).
2. Navigate to **Settings > Integrations > GitHub**.
3. Click **Connect** and authorise Supabase to access your GitHub account.
4. Select the repository (e.g. `ikhsanmasu/trustvault`).
5. Select the branch to watch (e.g. `dev` for staging, `main` for production).
6. Click **Save** or **Connect branch**.

#### How it works

- On every push to the linked branch, Supabase scans `supabase/migrations/` for new `.sql` files.
- New migrations are applied in timestamp order (the `YYYYMMDDHHMMSS` prefix determines ordering).
- Already-applied migrations are skipped (Supabase tracks which migrations have run).
- Results are visible in **Settings > Integrations > GitHub > Run History**.
- The CI workflow also validates migration file format (see Section 6).

#### Verification

After connecting and pushing the branch:

- Go to **Settings > Integrations > GitHub > Run History** in the Supabase Dashboard.
- Confirm each migration shows a green checkmark (applied successfully).
- If a migration fails, the run history shows the error. Fix the migration SQL, push again, and Supabase retries only the failed migration.

#### Fallback (if GitHub integration is not used)

```bash
npx supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
```

---

## 5. Supabase Auth Configuration (P2)

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

## 6. GitHub Actions CI (Updated for P4)

### Workflow File

Path: `.github/workflows/ci.yml`

### What the workflow must do

On every `push` and `pull_request` to `main` or `dev`:

1. Checkout repository.
2. Set up Node.js 22.
3. `npm ci` (installs dependencies).
4. `npm run lint` -- must exit 0.
5. `npx tsc --noEmit` -- must exit 0.
6. `npm run test` -- must exit 0 (tests across all test files including P5 eval tests).
7. Validate Supabase migration files exist and follow naming convention (`YYYYMMDDHHMMSS_descriptive_name.sql`).

### P4 Note on Unit Tests

P4 has 408 tests across 5 test files. P5 adds a sixth test file:
- `lib/core.test.ts` (160 tests): Pure functions for hashing, text extraction, schema.
- `tests/eval/eval.test.ts` (11 tests): AI materiality eval contracts.
- `tests/eval/p2-eval.test.ts` (64 tests): P2 RBAC, auth, profiles contracts.
- `tests/eval/p3-eval.test.ts` (109 tests): P3 multi-format, dashboard, profile, tenant contracts.
- `tests/eval/p4-eval.test.ts` (64 tests): P4 soft delete, restore, RLS, storage cleanup contracts.
- `tests/eval/p5-eval.test.ts` (P5): Blockchain anchoring, fingerprint computation, anchor/verify flows.

All tests are pure contract/eval tests that do not require a running Supabase instance. P5 eval tests for fingerprint computation do not require a running blockchain node (expected vs. actual fingerprint values are precomputed).

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

No new secrets are required for CI in P4. The lint/typecheck/test steps do not connect to Supabase.

---

## 7. Local Verify Script (P4)

Path: `scripts/verify.sh`

The `deployment` agent must create/update this script to verify the P4 build locally. The script is unchanged from P1-P2 in structure; it now validates 408 tests across 5 test files:

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

## 8. Vercel Deployment (Updated for P4)

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

| Variable | Environments | Sensitivity | P4 Status |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Plain | Unchanged. Production Supabase URL for production, localhost for local. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Plain | Unchanged. Production Supabase anon key for production. |
| `SUPABASE_SERVICE_ROLE_KEY` | All | **Sensitive (secret)** | Unchanged. Production Supabase service-role key. |
| `DEEPSEEK_API_KEY` | All | **Sensitive (secret)** | Unchanged. |

For Vercel preview deployments, use the same production Supabase credentials. Preview deployments share the same database and users as production (not isolated). For stricter environments, create a separate Supabase project for staging.

### Production Supabase Project

Create a Supabase project at [supabase.com](https://supabase.com) and run migrations. The recommended approach is Supabase GitHub auto-deploy (Section 4a). Fallback:

```bash
supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
```

This applies all P1-P4 migrations.

### Pre-Deploy Checklist (Ordered)

1. **Migrate database first:** Connect Supabase GitHub integration (Section 4a) or run `supabase db push` to production.
2. **Verify migration applied:** Check Supabase Dashboard → Settings → Integrations → GitHub → Run History.
3. **Configure Supabase Auth** (Section 5): Set Site URL and Redirect URLs in the Supabase Dashboard.
4. **Set Vercel environment variables** (Section 8).
5. **Push to main** to trigger Vercel deploy (CI validates migrations, then Vercel deploys).
6. **Verify:** Sign up a test user, upload a document, trigger a compare, soft-delete and restore a document.

**Never deploy the application before migrating the database** -- the P4 application expects `documents.deleted_at` and `documents.deleted_by` columns to exist, and the soft-delete/restore endpoints will fail without them.

### Deployment Flow

1. Push to `main` branch -> Vercel auto-deploys (after CI passes).
2. Pull requests -> Vercel creates preview deployments automatically.

---

## 9. Supabase Production Setup Checklist (Updated for P4)

Performed once when creating the production environment. Not repeated per deploy.

- [ ] Create Supabase project at supabase.com.
- [ ] Set up Supabase GitHub auto-deploy (Section 4a) and verify migrations apply, or run `supabase db push` with the production connection string (applies all P1-P4 migrations).
- [ ] **Verify RLS is enabled** on all tables: `tenants`, `profiles`, `documents`. Check **Authentication > Policies** in the Supabase Dashboard.
- [ ] **Verify the `on_auth_user_created` trigger** exists (Database > Triggers).
- [ ] **Configure Auth settings:** Site URL and Redirect URLs (Section 5).
- [ ] Verify the `documents` table has P2-P4 columns: `tenant_id` NOT NULL, `uploaded_by` NOT NULL, `file_type`, `deleted_at`, `deleted_by`.
- [ ] Verify the `documents_deleted_at_idx` index exists.
- [ ] Verify the `pdf-uploads` storage bucket is created with `public = false`.
- [ ] Copy the production Supabase URL, anon key, and service-role key into Vercel environment variables.
- [ ] Copy the DeepSeek API key into Vercel environment variables.

---

## 10. No-Go List (Updated for P4)

All P1-P3 "No-Go" items remain. P4 adds:

- Never deploy the application before running the P4 database migration (soft delete columns).
- Never edit prior migration files -- all P4 changes go in the P4 migration (`20260621000003_p4_soft_delete.sql`).
- Never run `supabase db reset` on the production database.
- Never use the production service-role key in local development.
- Never set `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` -- the service-role key must never be prefixed with `NEXT_PUBLIC_`.
- Never configure Supabase Auth Site URL to `localhost` for the production project -- use the actual Vercel domain.
- Never hard-delete a `documents` row from the database -- use the soft-delete flow (set `deleted_at`).
- Never skip the migration validation step in CI -- broken migration files block deployment.
- Never manually run `supabase db push` on production if Supabase GitHub auto-deploy is connected (double-application risk).
- Never deploy the application before running the P5 database migration (anchoring columns).
- Never deploy the application before deploying the `TrustVaultAnchor` contract and setting `ANCHOR_CONTRACT_ADDRESS`.
- Never expose `ANCHOR_PRIVATE_KEY` in client-side code or env vars with `NEXT_PUBLIC_` prefix.
- Never commit `ANCHOR_PRIVATE_KEY` or any real private key to the repository.

---

## 11. P1-P4 Baseline (Preserved)

All P1-P4 deployment steps remain valid and are incorporated above. The P1 deployment document Sections 2-8 and P2-P4 extensions are the foundation that P5 extends. Key preserved items:
- Local dev setup with Supabase CLI.
- Migration naming convention and apply process.
- GitHub Actions CI workflow.
- Vercel build configuration.
- Deploy script (`scripts/deploy.sh`).
- Supabase GitHub auto-deploy integration.

---

## 12. P5 Additions: Blockchain Node & Contract Deployment

### 12a. New P5 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `viem` | ^2.x (latest) | EVM interaction, contract calls, transaction signing, keccak256 hashing. Replaces ethers. |
| `solc` | ^0.8.20 (dev) | Solidity compiler for `TrustVaultAnchor.sol`. Optional if using Foundry. |

The `viem` dependency must be added to `package.json` by the `scaffold` agent before build agents start.

### 12b. New Environment Variables for P5

| Variable | Scope | Description | Required |
|---|---|---|---|
| `ANCHOR_RPC_URL` | Server-only | JSON-RPC endpoint URL | Yes (for anchor/verify to work) |
| `ANCHOR_CHAIN_ID` | Server-only | EVM chain ID as integer | Yes |
| `ANCHOR_CONTRACT_ADDRESS` | Server-only | Deployed `TrustVaultAnchor` address (`0x`-prefixed) | Yes |
| `ANCHOR_PRIVATE_KEY` | Server-only | Private key for signing anchor transactions | Yes (for anchor to work; verify works without it if using read-only client) |

**Note:** `ANCHOR_PRIVATE_KEY` is only required for `POST /api/anchor`. `POST /api/verify` uses a read-only public client and does not need the private key. If anchoring is not available (no private key configured), the verify endpoint can still check previously anchored documents.

**Local dev (`.env.local`)** -- add these entries:

```
# P5: Blockchain Anchoring (Anvil local dev)
ANCHOR_RPC_URL=http://127.0.0.1:8545
ANCHOR_CHAIN_ID=31337
ANCHOR_CONTRACT_ADDRESS=<output from deploy-anchor.ts>
ANCHOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 12c. Local Anvil Setup

**Prerequisite:** Install Foundry (https://book.getfoundry.sh/getting-started/installation).

**Step 1 -- Start Anvil** (terminal 1, keep running):

```bash
anvil
```

This starts a local Ethereum node at `http://127.0.0.1:8545` with chain ID 31337 and 10 prefunded accounts (10,000 ETH each).

**Step 2 -- Deploy the contract** (terminal 2):

```bash
npx tsx scripts/deploy-anchor.ts
```

**Expected output:**
```
Deploying TrustVaultAnchor to chain 31337...
Transaction hash: 0x...
Contract deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

**Step 3 -- Update `.env.local`:**

Copy the deployed contract address into `ANCHOR_CONTRACT_ADDRESS` in `.env.local`.

**Step 4 -- Verify deployment:**

```bash
# Read the contract to confirm it's deployed
cast call <CONTRACT_ADDRESS> "anchoredAt(bytes32)(uint256)" "0x0000000000000000000000000000000000000000000000000000000000000001" --rpc-url http://127.0.0.1:8545
# Should return 0 (no fingerprint anchored yet)
```

### 12d. Full Local Dev Workflow (P5)

1. Start Supabase: `supabase start`
2. Apply all migrations: `supabase db reset` (applies P1-P5 migrations)
3. Start Anvil: `anvil` (separate terminal)
4. Deploy contract: `npx tsx scripts/deploy-anchor.ts`
5. Update `.env.local` with the contract address
6. Start Next.js: `npm run dev`
7. Open `http://localhost:3000`, sign up/sign in, upload a document, click the shield icon to anchor it, verify it

### 12e. Railway Deployment for Anvil (Staging/Demo)

For a persistent blockchain endpoint in a deployed environment, run Anvil as a separate Railway service.

**Dockerfile:** `docker/anvil.Dockerfile`

```dockerfile
FROM ghcr.io/foundry-rs/foundry:latest

RUN mkdir -p /data

EXPOSE 8545

ENTRYPOINT ["anvil", "--host", "0.0.0.0", "--state", "/data/anvil.state", "--state-interval", "5"]
```

**Railway service configuration:**

| Setting | Value |
|---|---|
| Service name | `trustvault-anvil` |
| Source | Dockerfile at `docker/anvil.Dockerfile` |
| Port | 8545 |
| Protocol | TCP |
| Health check | TCP connect to port 8545 |
| Volume | `/data` (1 GB, persistent) |
| Environment variables | None required (Anvil uses defaults) |

**After the Anvil service is running:**

1. Note the Railway service URL (e.g., `trustvault-anvil.railway.internal:8545` for internal traffic, or the public domain).
2. Set `ANCHOR_RPC_URL` in the Next.js service's environment variables to point to the Anvil service.
3. Run `npx tsx scripts/deploy-anchor.ts` once (with the appropriate `ANCHOR_RPC_URL`) to deploy the contract to the Railway-hosted Anvil instance.
4. Set `ANCHOR_CONTRACT_ADDRESS` in the Next.js service to the deployed contract address.
5. Use one of Anvil's deterministic private keys as `ANCHOR_PRIVATE_KEY` (the prefunded accounts are the same every time Anvil starts from the same state file).

**Important:** The Anvil state file at `/data/anvil.state` persists the blockchain state across Railway restarts. Without it, the chain resets to genesis on every restart, losing all anchored data.

### 12f. Production Deployment (Public Testnet / Mainnet)

For production, do NOT use Anvil on Railway. Instead, use a public testnet or mainnet with a reliable RPC provider.

**Step 1 -- Fund a signer account:**

- Generate a new account: `cast wallet new` (Foundry) or use a hardware wallet.
- Fund it with testnet ETH (Sepolia faucet) or real ETH (exchange/on-ramp).
- Set `ANCHOR_PRIVATE_KEY` to the account's private key.

**Step 2 -- Deploy the contract:**

```bash
ANCHOR_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY \
ANCHOR_CHAIN_ID=11155111 \
ANCHOR_PRIVATE_KEY=0x... \
npx tsx scripts/deploy-anchor.ts
```

**Step 3 -- Verify the contract on Etherscan (optional but recommended):**

```bash
forge verify-contract \
  --rpc-url https://sepolia.infura.io/v3/YOUR_KEY \
  --etherscan-api-key YOUR_ETHERSCAN_API_KEY \
  <CONTRACT_ADDRESS> \
  contracts/TrustVaultAnchor.sol:TrustVaultAnchor
```

A verified contract allows anyone to inspect the source code and independently confirm the anchoring logic.

**Step 4 -- Set Vercel environment variables:**

Add all four `ANCHOR_*` variables in Vercel > Settings > Environment Variables. Mark `ANCHOR_PRIVATE_KEY` as **Sensitive**.

### 12g. Contract Deployment Script Details

**File:** `scripts/deploy-anchor.ts` (owned by `deployment` agent)

The script uses viem to deploy the compiled contract. Key behavior:

1. Reads env vars: `ANCHOR_RPC_URL`, `ANCHOR_CHAIN_ID`, `ANCHOR_PRIVATE_KEY`.
2. Reads compiled artifacts:
   - ABI from `contracts/out/TrustVaultAnchor_sol_TrustVaultAnchor.abi` (solc output)
   - Bytecode from `contracts/out/TrustVaultAnchor_sol_TrustVaultAnchor.bin`
3. Creates a viem wallet client and public client.
4. Calls `walletClient.deployContract({ abi, bytecode, args: [] })`.
5. Waits for receipt via `publicClient.waitForTransactionReceipt()`.
6. Prints the deployed contract address.

**Fallback if solc artifacts not found:** Try Foundry artifacts from `out/TrustVaultAnchor.sol/TrustVaultAnchor.json` (Forge output format). The script should detect which artifact format is available.

**Usage:**
```bash
# All four env vars must be set
ANCHOR_RPC_URL=<url> ANCHOR_CHAIN_ID=<id> ANCHOR_PRIVATE_KEY=<key> npx tsx scripts/deploy-anchor.ts
```

### 12h. CI Updates for P5

The GitHub Actions CI workflow must:

1. Continue running `eslint`, `tsc --noEmit`, and `vitest run` (unchanged).
2. **New:** Validate that the new P5 migration file exists and follows the naming convention (`20260622000000_p5_blockchain_anchor.sql`).
3. **New (optional):** Run `solc` or `forge build` to verify the Solidity contract compiles without errors. This requires Foundry or `solc` available in the CI environment.

**Recommended CI addition (Foundry check):**

```yaml
- name: Install Foundry
  uses: foundry-rs/foundry-toolchain@v1

- name: Compile Solidity contract
  run: forge build --contracts contracts/
```

If Foundry is not available in CI, the Solidity compilation check can be skipped (the deploy script validates at deploy time). The contract is simple enough that compilation errors are unlikely once tested locally.

### 12i. Vercel Deployment for P5

**New environment variables required in Vercel:**

| Variable | Environments | Sensitivity |
|---|---|---|
| `ANCHOR_RPC_URL` | Production, Preview | Plain |
| `ANCHOR_CHAIN_ID` | Production, Preview | Plain |
| `ANCHOR_CONTRACT_ADDRESS` | Production, Preview | Plain |
| `ANCHOR_PRIVATE_KEY` | Production, Preview | **Sensitive (secret)** |

**Preview deployments:** Use the same Anvil instance (Railway) or a dedicated Sepolia contract for preview environments. Alternatively, skip anchor functionality in preview deployments by not setting `ANCHOR_PRIVATE_KEY` -- the app should handle the missing configuration gracefully (anchor button disabled, verify still works if documents were previously anchored).

### 12j. Pre-Deploy Checklist Additions (P5)

Before deploying P5 to production:

- [ ] Verify the P5 migration (`20260622000000_p5_blockchain_anchor.sql`) has been applied to the production Supabase database (check Supabase Dashboard > Integrations > GitHub > Run History, or run `supabase db push`).
- [ ] Verify the four new columns (`fingerprint`, `chain`, `tx_hash`, `anchored_at`) exist on the production `documents` table.
- [ ] Verify the `documents_fingerprint_unique` constraint exists.
- [ ] Verify the `documents_update_anchor` RLS policy exists and is enabled.
- [ ] Deploy the `TrustVaultAnchor` contract to the target chain.
- [ ] Set `ANCHOR_CONTRACT_ADDRESS` to the deployed contract address.
- [ ] Set `ANCHOR_PRIVATE_KEY` to a funded account on the target chain.
- [ ] Test a full anchor + verify cycle on production (upload a document, anchor it, verify it).
- [ ] Verify the `ANCHOR_PRIVATE_KEY` account balance is sufficient for expected anchor volume.

---

## 13. P16 Additions: Custom AI Agents Deployment

### 13a. New P16 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `whatsapp-web.js` | ^1.25.x (latest) | WhatsApp Web client (Puppeteer-based). Requires a running Chromium instance. |
| `node-telegram-bot-api` | ^0.66.x (latest) | Telegram Bot API client. Supports webhooks (preferred for Vercel production). |
| `qrcode.react` | ^4.x (latest) | Client-side QR code rendering for WhatsApp QR scan flow. Alternatively, `qrcode` (server) can be used for SVG generation. |

The `scaffold` agent must add all three to `package.json`.

**Peer dependency note:** `whatsapp-web.js` depends on `puppeteer`. In a Vercel serverless environment, `puppeteer` must be replaced with `@sparticuz/chromium` (serverless-compatible Chromium). The `backend` agent handles this configuration in `lib/agents/channel-manager.ts`. The `scaffold` agent does NOT need to add `puppeteer` or `@sparticuz/chromium` -- these are backend-owned concerns.

### 13b. New Environment Variables for P16

| Variable | Scope | Description | Required |
|---|---|---|---|
| `AGENT_CHANNEL_ENCRYPTION_KEY` | Server-only | 32-byte base64-encoded AES-256 key for encrypting channel credentials. Generate via: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. | Yes (for channel functionality) |
| `APP_URL` | Server-only | Public URL of the deployed application (e.g., `https://trustvault.vercel.app`). Used to construct Telegram webhook URLs. | Yes (for Telegram webhook) |
| `TELEGRAM_WEBHOOK_SECRET` | Server-only | (Optional but recommended) Secret token for Telegram webhook verification. Passed as `secret_token` in `setWebhook`. | Recommended |
| `WHATSAPP_WEBHOOK_SECRET` | Server-only | (Future) Secret for WhatsApp Business API webhook validation. Not used in P16. | No |

**Local dev (`.env.local`)** -- add these entries:

```
# P16: Custom AI Agents
AGENT_CHANNEL_ENCRYPTION_KEY=<generated 32-byte base64 key>
APP_URL=http://localhost:3000
TELEGRAM_WEBHOOK_SECRET=<optional local dev secret>
```

**Generating `AGENT_CHANNEL_ENCRYPTION_KEY`:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Example output: `dGhpcyBpcyBhIDMyIGJ5dGUgZW5jcnlwdGlvbiBrZXk=` (44 characters).

**Dev fallback:** If `AGENT_CHANNEL_ENCRYPTION_KEY` is not set in development, the `channel-encryption.ts` module uses a hardcoded dev key and emits a warning. Production MUST set this variable.

### 13c. Local Dev Workflow (P16 Additions)

Additional steps for P16 agent features:

1. **Generate encryption key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Add the output as `AGENT_CHANNEL_ENCRYPTION_KEY` in `.env.local`.

2. **Set APP_URL:**
   Add `APP_URL=http://localhost:3000` to `.env.local`.

3. **WhatsApp local testing:**
   - WhatsApp Web client uses local Chrome/Chromium (installed by `puppeteer`).
   - No additional setup needed. The QR code appears in the browser UI during connect flow.
   - Scan with WhatsApp mobile app (linked devices feature).

4. **Telegram local testing:**
   - Create a bot via [@BotFather](https://t.me/BotFather) on Telegram.
   - Get the bot token.
   - Use a tunneling service (ngrok, localtunnel) to expose `localhost:3000` to the internet for webhook delivery:
     ```bash
     ngrok http 3000
     ```
   - Set `APP_URL` to the ngrok URL (e.g., `https://abc123.ngrok.io`).
   - Connect the agent to Telegram using the bot token. The webhook is registered to the ngrok URL.
   - For local dev without webhooks, `node-telegram-bot-api` can use long-polling mode as a fallback.

5. **Verify new migration:**
   ```bash
   supabase db reset
   ```
   This applies all migrations including `20260703000002_p16_agents.sql`.

### 13d. Migration Structure (Updated for P16)

```
supabase/
  migrations/
    20260621000000_init.sql              ← P1: documents table + bucket
    20260621000001_p2_auth_rbac.sql      ← P2: tenants, profiles, RLS, trigger
    20260621000002_p3_multiformat.sql    ← P3: multi-format support
    20260621000003_p4_soft_delete.sql    ← P4: soft delete
    20260622000000_p5_blockchain_anchor.sql  ← P5: anchoring columns
    20260701000000_p6_ai_assistant.sql   ← P6: pgvector, chat tables
    20260703000000_p14_rbac_invitations.sql  ← P14: tenant RBAC + invitations
    20260703000002_p16_agents.sql        ← P16: agents, agent_documents,
                                              agent_channels, agent_sessions,
                                              agent_messages + RLS policies
  seed.sql
```

### 13e. Vercel Deployment for P16

**New environment variables required in Vercel:**

| Variable | Environments | Sensitivity |
|---|---|---|
| `AGENT_CHANNEL_ENCRYPTION_KEY` | Production, Preview | **Sensitive (secret)** |
| `APP_URL` | Production, Preview | Plain |
| `TELEGRAM_WEBHOOK_SECRET` | Production, Preview | **Sensitive (secret)** |

**WhatsApp in Vercel serverless:**

The `whatsapp-web.js` library requires a persistent Chromium process. Vercel's serverless functions are not suitable for long-running Puppeteer instances. Two deployment options:

**Option A -- Separate WhatsApp Service (Recommended for production):**
- Deploy a separate lightweight Node.js service (Railway, Fly.io, or a VPS) that runs the WhatsApp clients.
- The Next.js API routes communicate with this service via HTTP (e.g., `POST /connect`, `GET /status`, etc.).
- The service uses the same Supabase database and encryption key.
- This is the recommended architecture for production. The `ChannelManager` in `lib/agents/channel-manager.ts` is designed for this via a swappable `WhatsAppClientProvider`.

**Option B -- Vercel + @sparticuz/chromium (Simple, limited):**
- Use `@sparticuz/chromium` for serverless-compatible Chromium.
- WhatsApp connections are ephemeral -- serverless cold starts destroy the browser.
- Session state is persisted to the database (encrypted in `agent_channels.config`) and restored on next invocation.
- Acceptable for demo/low-traffic scenarios. Not recommended for production use with multiple concurrent agents.

**For P16, Option A (separate service) is the recommended production architecture.** The separate WhatsApp service is documented but its implementation is a deployment concern (not in scope for the `backend` agent). The `backend` agent implements the `WhatsAppClientProvider` interface with both an in-process implementation (for local dev) and an HTTP-based implementation (for production with a separate service).

**Telegram in Vercel serverless:**

Telegram webhooks work well with Vercel serverless functions. Each webhook request is a stateless HTTP call. The `node-telegram-bot-api` library's webhook mode receives the update, processes it via the RAG pipeline, and sends the reply -- all within one function invocation. No persistent process needed.

The `APP_URL` env var must be set to the Vercel deployment URL for webhook registration.

### 13f. CI Updates for P16

The GitHub Actions CI workflow must:

1. Continue running `eslint`, `tsc --noEmit`, and `vitest run` (unchanged).
2. Validate that the new P16 migration file exists and follows the naming convention (`20260703000002_p16_agents.sql`).
3. No new CI dependencies are required for P16 (no Solidity compilation needed).

### 13g. Pre-Deploy Checklist Additions (P16)

Before deploying P16 to production:

- [ ] Verify the P16 migration (`20260703000002_p16_agents.sql`) has been applied to the production Supabase database.
- [ ] Verify the five new tables exist: `agents`, `agent_documents`, `agent_channels`, `agent_sessions`, `agent_messages`.
- [ ] Verify RLS is enabled on all five new tables.
- [ ] Generate `AGENT_CHANNEL_ENCRYPTION_KEY` for production (never reuse the dev key).
- [ ] Set `AGENT_CHANNEL_ENCRYPTION_KEY` in Vercel, marked as **Sensitive**.
- [ ] Set `APP_URL` in Vercel to the production Vercel domain.
- [ ] (Optional) Set `TELEGRAM_WEBHOOK_SECRET` in Vercel.
- [ ] If using a separate WhatsApp service, deploy and configure it.
- [ ] Test agent creation, knowledge-base document selection, and playground chat.
- [ ] Test Telegram bot connection and webhook message handling.
- [ ] Test WhatsApp QR scan flow (if WhatsApp service is deployed).
- [ ] Verify channel credentials in the database are encrypted (check `agent_channels.config` contains `{ "encrypted": "..." }`).

### 13h. No-Go List Additions (P16)

- Never deploy the application before running the P16 database migration.
- Never edit prior migration files -- all P16 changes go in `20260703000002_p16_agents.sql`.
- Never set `AGENT_CHANNEL_ENCRYPTION_KEY` with the `NEXT_PUBLIC_` prefix.
- Never reuse the development encryption key in production.
- Never commit `AGENT_CHANNEL_ENCRYPTION_KEY` or any real channel credentials.
- Never run Puppeteer with `--no-sandbox` in a production environment without proper container isolation.
- Never leave Telegram webhooks registered for deleted agents or disconnected channels.
- Never store channel credentials as plaintext in the database or in logs.
