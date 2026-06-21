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

### Option A: One command

```bash
./start.sh
```

This runs: install deps → start Supabase → apply migrations → seed demo data → start Next.js.
Open http://localhost:3000 — login: `demo@trustvault.dev` / `demo123456`.

### Option B: With Docker (blockchain anchoring)

```bash
./start-docker.sh
```

Same as Option A, but runs Next.js + Anvil in Docker containers.
Requires Docker installed.

### Option C: Production

1. Connect Vercel + Supabase Cloud
2. Set env vars (see `.env.example`)
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
bash scripts/verify.sh  # Full check
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
