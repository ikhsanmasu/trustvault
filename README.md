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
- **3-step pipeline**: Binary hash → Text hash → Intelligent analysis
- **Blockchain anchoring**: EVM-compatible (Anvil local, any L2 for prod)
- **Soft delete**: Remove files while preserving integrity hashes
- **Multi-tenant**: Projects, roles (admin/editor/viewer), tenant isolation
- **Dark mode**: Full theme support with toggle
- **481 tests** across 7 test files

## Quick Start

### Prerequisites

- **Node.js** >= 22
- **Docker** (for `docker compose` / Supabase CLI)
- **Supabase CLI**: `npm install -g supabase` (or use `npx supabase`)

### Option A: Shell script (recommended)

```bash
# 1. Clone and set up
git clone https://github.com/ikhsanmasu/trustvault.git
cd trustvault
cp .env.example .env.local

# 2. Add your DeepSeek API key to .env.local
#    DEEPSEEK_API_KEY=sk-your-key-here

# 3. Run
./start.sh
```

Open http://localhost:3000 — login: `demo@trustvault.dev` / `demo123456`.

The script runs: `npm install` → `npx supabase start` → `npx supabase db reset` → `npx tsx scripts/seed-demo.ts` → `npm run dev`.

### Option A (manual): Step by step

```bash
git clone https://github.com/ikhsanmasu/trustvault.git
cd trustvault
cp .env.example .env.local
# Edit .env.local — set DEEPSEEK_API_KEY

npm install                          # 1. Install dependencies
npx supabase start                   # 2. Start Supabase (DB + Auth + Storage)
npx supabase db reset                # 3. Apply all migrations + seed SQL
npx tsx scripts/seed-demo.ts         # 4. Create demo user + upload samples
npm run dev                          # 5. Start Next.js dev server
```

Open http://localhost:3000. Login: `demo@trustvault.dev` / `demo123456`.

### Option B: Docker + blockchain anchoring

```bash
git clone https://github.com/ikhsanmasu/trustvault.git
cd trustvault
cp .env.example .env.local
# Edit .env.local — set DEEPSEEK_API_KEY

# 1. Start Supabase
npx supabase start
npx supabase db reset
npx tsx scripts/seed-demo.ts

# 2. Start Docker (Anvil + App)
docker compose up -d

# 3. Contract address is printed in logs:
docker compose logs deploy-anchor | grep "Deployed at"
# → Add ANCHOR_CONTRACT_ADDRESS=0x... to .env.local

# 4. Open
open http://localhost:3000
```

Or use the combined script: `./start-docker.sh`

### Option C: Production (Vercel + Supabase Cloud)

1. Push to GitHub
2. Connect Vercel → import repo → set env vars (see `.env.example`)
3. Connect Supabase → GitHub integration (auto-migrations on push to main)
4. Deploy anchor contract to L2: `npx tsx scripts/deploy-anchor.ts`
5. PR dev → main → auto-deploy everything

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key for AI compare |
| `ANCHOR_RPC_URL` | P5 | EVM RPC URL (local: `http://127.0.0.1:8545`) |
| `ANCHOR_CHAIN_ID` | P5 | Chain ID (local: `31337`) |
| `ANCHOR_CONTRACT_ADDRESS` | P5 | Deployed contract address |
| `ANCHOR_PRIVATE_KEY` | P5 | Signer private key (server-only, local default: `0xac09...`) |

## Demo Account

After running seed: `demo@trustvault.dev` / `demo123456`

Comes with 16 documents across 7 file types (PDF, DOCX, XLSX, JSON, CSV, TXT, MD).

## Commands

```bash
npm run dev           # Dev server
npm run build         # Production build
npm run test          # 481 tests (7 files)
npm run lint          # ESLint
bash scripts/verify.sh  # Full check: lint + tsc + tests
```

## Project Structure

```
app/                     # Next.js App Router (pages + API routes)
components/              # UI components (ui/, landing/, app)
lib/                     # Core logic (hashing, anchor, api-client, types)
hooks/                   # React hooks
supabase/migrations/     # SQL migrations (P1-P5)
contracts/               # Solidity smart contracts
scripts/                 # deploy-anchor.ts, seed-demo.ts, verify.sh
docker/                  # Dockerfiles (Anvil)
docs/                    # Architecture, API spec, security, roadmap
tests/eval/              # Eval test suites (P1-P5)
```

## License

MIT
