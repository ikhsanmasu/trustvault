# TrustVault

**Cryptographic document integrity vault.** Upload, track, compare, and verify your documents with deterministic hashing and blockchain anchoring.

## What it does

```
Upload → SHA-256 Hash → Extract Text → Store
  ↓
Upload new version → Compare Hashes → AI Analysis → MATERIAL / NOT MATERIAL verdict
  ↓
Anchor fingerprint on-chain → Verify integrity anytime
```

- **14 file formats**: PDF, DOCX, XLSX, JSON, CSV, TXT, HTML, Markdown, XML, RTF, DOC, ODT
- **3-step pipeline**: Binary hash → Text hash → Intelligent analysis (only when content changes)
- **Blockchain anchoring**: Anchor fingerprints to EVM chains (Anvil local, any L2 for prod)
- **Soft delete**: Remove files while preserving integrity hashes for audit
- **Multi-tenant**: Projects, roles (admin/editor/viewer), tenant isolation
- **Dark mode**: Full theme support with toggle

## Quick Start

### Option A: Local dev (recommended)

```bash
git clone https://github.com/ikhsanmasu/trustvault.git
cd trustvault
cp .env.example .env.local
# Edit .env.local — add your DEEPSEEK_API_KEY

npx supabase start                # Start Supabase (DB + Auth + Storage)
npm install
npx supabase db reset             # Apply migrations + seed SQL
npx tsx scripts/seed-demo.ts      # Create demo user + upload sample files
npm run dev                       # Start Next.js

open http://localhost:3000
# Login: demo@trustvault.dev / demo123456
# 16 documents ready across 7 file types
```

### Option B: Docker (blockchain anchoring)

```bash
# After Supabase is running (npx supabase start):
docker compose up -d
# Starts Anvil + deploys anchor contract + runs Next.js
```

### Option C: Production (Vercel + Supabase Cloud)

1. Connect Vercel + Supabase Cloud
2. Set env vars (see .env.example)
3. Connect Supabase GitHub integration for auto-migrations
4. Deploy anchor contract: `npx tsx scripts/deploy-anchor.ts`
5. PR to main → auto-deploy

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server) |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key |
| `ANCHOR_RPC_URL` | P5 | EVM RPC (e.g. http://127.0.0.1:8545) |
| `ANCHOR_CHAIN_ID` | P5 | Chain ID (31337 = Anvil) |
| `ANCHOR_CONTRACT_ADDRESS` | P5 | Deployed contract address |
| `ANCHOR_PRIVATE_KEY` | P5 | Signer private key (server-only) |

## Commands

```bash
npm run dev           # Dev server
npm run build         # Production build
npm run test          # 481 tests (7 files)
npm run lint          # ESLint
bash scripts/verify.sh  # Full check: lint + tsc + tests
```

## Structure

```
app/                     # Next.js App Router (pages + API)
components/              # UI components (ui/, landing/, app)
lib/                     # Core logic (hashing, anchor, types, api-client)
hooks/                   # React hooks
supabase/migrations/     # SQL migrations (P1-P5)
contracts/               # Solidity smart contracts
scripts/                 # deploy-anchor.ts, seed-demo.ts, verify.sh
docker/                  # Dockerfiles (Anvil)
docs/                    # Architecture, API spec, security, roadmap
tests/eval/              # Eval suites (P1-P5)
```

## Tests

```
481 tests · 7 files
├── lib/core.test.ts (173)
├── lib/explorers.test.ts (13)
├── tests/eval/eval.test.ts (11)
├── tests/eval/p2-eval.test.ts (64)
├── tests/eval/p3-eval.test.ts (109)
├── tests/eval/p4-eval.test.ts (64)
└── tests/eval/p5-eval.test.ts (47)
```

## License

MIT
