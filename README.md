# InTrustVault

**Cryptographic document integrity vault.** Upload, track, compare, and verify your documents with deterministic hashing, AI materiality assessment, and blockchain anchoring.

## What it does

```
Upload → SHA-256 Hash → Extract Text → Store
  ↓
Upload new version → Compare Hashes → AI Analysis → MATERIAL / NOT MATERIAL verdict
  ↓
Anchor fingerprint on-chain → Verify integrity anytime
```

- **14 file formats** · **3-step hashing pipeline** · **Magic-byte upload validation** · **AI Vault Assistant (RAG with citations)** · **Blockchain anchoring** · **Soft delete with audit trail** · **Tenant-level RBAC** · **Public share links** · **Plan-based usage quotas (atomic)** · **Dark mode** · **717 tests**

## Prerequisites

- **Node.js** >= 22
- **Docker** (used by the Supabase CLI for local containers)
- **Supabase CLI**: `npm install -g supabase` (or use `npx supabase`)

## Quick Start

```bash
git clone https://github.com/ikhsanmasu/intrustvault.git
cd intrustvault
cp .env.example .env.local
# Add your DEEPSEEK_API_KEY (and OPENAI_API_KEY for the assistant) to .env.local

./start-local.sh
```

Opens http://localhost:3000 — login: `demo@intrustvault.dev` / `demo123456`

The script installs deps, starts Supabase, applies migrations, seeds demo data, and starts Next.js. The demo includes 16 documents across 7 file types.

## Manual setup (step by step)

```bash
git clone https://github.com/ikhsanmasu/intrustvault.git
cd intrustvault
cp .env.example .env.local      # add DEEPSEEK_API_KEY + OPENAI_API_KEY

npm install                      # 1. Install dependencies
npx supabase start               # 2. Start Supabase (DB + Auth + Storage)
npx supabase db reset            # 3. Apply all migrations + seed SQL + restart
npx tsx scripts/seed-demo.ts     # 4. Upload sample documents (optional, may fail if data exists)
npm run dev                      # 5. Start Next.js
```

Login: `demo@intrustvault.dev` / `demo123456` — 16 documents ready.

## Production deployment (Vercel + Supabase)

1. Push to GitHub → connect **Vercel** (auto-deploy on push to main). `vercel.json` also registers the daily usage-reset cron.
2. Connect the **Supabase GitHub integration** (auto-applies `supabase/migrations/` on push to main).
3. Set env vars in Vercel (see `.env.example`) — `CRON_SECRET` is required in production.
4. (Optional) Blockchain anchoring: deploy the contract to an L2/testnet with `npx tsx scripts/deploy-anchor.ts` and set the `ANCHOR_*` vars. Without them, the anchor button is disabled and everything else works.
5. PR dev → main → auto-deploy everything.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server) |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key (materiality compare + chat) |
| `OPENAI_API_KEY` | Yes | OpenAI API key (embeddings for the assistant) |
| `CRON_SECRET` | Production | Auth for the Vercel cron endpoint |
| `RESEND_API_KEY` | Optional | Invitation emails via Resend |
| `ANCHOR_RPC_URL` / `ANCHOR_CHAIN_ID` / `ANCHOR_CONTRACT_ADDRESS` / `ANCHOR_PRIVATE_KEY` | Optional | Blockchain anchoring (local: anvil at http://127.0.0.1:8545) |
| `ADMIN_MONITORING_SECRET` | Optional | Access to /admin/monitoring |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional | Error tracking |

## Commands

```bash
npm run dev              # Dev server
npm run test             # 717 tests (16 files)
npm run lint             # ESLint (zero warnings)
npm run typecheck        # tsc --noEmit
bash scripts/verify.sh   # Full check: lint + tsc + tests
```

## Structure

```
app/                     # Next.js App Router (pages + API route handlers)
components/              # UI components
lib/                     # Core logic (hashing, extraction, AI, quotas)
lib/services/            # Upload pipeline service
hooks/                   # React hooks
supabase/migrations/     # SQL migrations (applied in timestamp order)
contracts/               # Solidity anchor contract
scripts/                 # CLI scripts (seed, deploy-anchor, verify)
docs/                    # Architecture & contract docs
tests/                   # Unit / integration / eval suites
```

## License

MIT
