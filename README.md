# InTrustVault

**Cryptographic document integrity vault.** Upload, track, compare, and verify your documents with deterministic hashing and blockchain anchoring.

## What it does

```
Upload → SHA-256 Hash → Extract Text → Store
  ↓
Upload new version → Compare Hashes → AI Analysis → MATERIAL / NOT MATERIAL verdict
  ↓
Anchor fingerprint on-chain → Verify integrity anytime
```

- **14 file formats** · **3-step hashing pipeline** · **Blockchain anchoring** · **Soft delete with audit trail** · **Tenant-level RBAC** · **Dark mode** · **481 tests**

## Prerequisites

- **Node.js** >= 22
- **Docker** (for Supabase CLI)
- **Supabase CLI**: `npm install -g supabase` (or use `npx supabase`)

## Quick Start

```bash
git clone https://github.com/ikhsanmasu/intrustvault.git
cd intrustvault
cp .env.example .env.local
# Add your DEEPSEEK_API_KEY to .env.local

./start-local.sh
```

Opens http://localhost:3000 — login: `demo@intrustvault.dev` / `demo123456`

The script installs deps, starts Supabase, applies migrations, seeds demo data, and starts Next.js. The demo includes 16 documents across 7 file types.

## Manual setup (step by step)

```bash
git clone https://github.com/ikhsanmasu/intrustvault.git
cd intrustvault
cp .env.example .env.local      # add DEEPSEEK_API_KEY

npm install                      # 1. Install dependencies
npx supabase start               # 2. Start Supabase (DB + Auth + Storage)
npx supabase db reset            # 3. Apply all migrations + seed SQL + restart
npx tsx scripts/seed-demo.ts     # 4. Upload sample documents (optional, may fail if data exists)
npm run dev                      # 5. Start Next.js
```

Login: `demo@intrustvault.dev` / `demo123456` — 16 documents ready.

## Production deployment

1. Push to GitHub → connect **Vercel** (auto-deploy on push to main)
2. Connect **Supabase GitHub integration** (auto-migrations on push to main)
3. Set env vars in Vercel (see `.env.example`)
4. Deploy anchor contract to L2: `npx tsx scripts/deploy-anchor.ts`
5. PR dev → main → auto-deploy everything

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server) |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key |
| `ANCHOR_RPC_URL` | P5 | EVM RPC (local: http://127.0.0.1:8545) |
| `ANCHOR_CHAIN_ID` | P5 | Chain ID (local: 31337) |
| `ANCHOR_CONTRACT_ADDRESS` | P5 | Deployed contract address |
| `ANCHOR_PRIVATE_KEY` | P5 | Signer private key (server-only) |

## Commands

```bash
npm run dev              # Dev server
npm run test             # 481 tests (7 files)
bash scripts/verify.sh   # Full check: lint + tsc + tests
```

## Structure

```
app/                     # Next.js App Router
components/              # UI components
lib/                     # Core logic
hooks/                   # React hooks
supabase/migrations/     # SQL migrations (P1-P5)
contracts/               # Solidity
scripts/                 # CLI scripts
docker/                  # Dockerfiles
docs/                    # Architecture docs
tests/eval/              # Eval suites
```

## License

MIT
