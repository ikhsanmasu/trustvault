# TrustVault -- Security Model (P5)

This document is a **contract** for the `security` audit agent and a reference for `backend` and `deployment`. It defines the accepted threat model for P5 and the controls in place. P1-P4 sections that remain valid are noted as preserved.

---

## 1. P2 Threat Model

TrustVault P2 is a **multi-tenant, authenticated** system. Unlike P1 (which was unauthenticated and single-operator), P2 introduces user identity, tenant scoping, project-based access control, and role-based permissions. The threat model shifts from "trusted local operator" to "authenticated users who must not see each other's data."

### What P2 protects against

| Threat | Control |
|---|---|
| Unauthenticated access to any API endpoint | All API endpoints require a valid Supabase session. 401 returned if missing. |
| Cross-tenant data access (user A sees tenant B's documents) | RLS policies on all data tables filter by tenant. Even a buggy route handler cannot leak data. |
| Cross-project data access within a tenant (user A sees project B's documents without membership) | RLS on `documents` checks project membership. |
| Unauthorised write operations (viewer uploads a document) | Route handler checks role before insert. RLS on `documents` INSERT policy requires `admin` or `editor`. |
| Privilege escalation (editor makes themselves admin) | RLS on `project_members` UPDATE/DELETE policies require `admin` role. |
| Session hijacking | HTTP-only cookies prevent JavaScript access to session tokens. `@supabase/ssr` uses `SameSite=Lax` cookies. |
| AI prompt injection via crafted PDF text | System prompt isolation + Zod schema validation on AI output (preserved from P1). |
| DeepSeek API key exposure | Key lives only in server-side env vars; never in client bundles. |
| Service-role key misuse | Service-role client is restricted to admin-only operations (profile creation trigger). All user-facing queries use user-scoped JWT. |

### What P2 does NOT protect against (accepted risks)

| Risk | Accepted? | Rationale |
|---|---|---|
| Rate limiting on API endpoints | Yes | Left to deployment layer (Vercel WAF or reverse proxy). Not in application scope. |
| Brute-force login attempts | Partial | Supabase Auth has built-in rate limiting. Additional rate limiting on the Next.js server is a deployment concern. |
| Admin removes themselves as last admin | No | Blocked at application layer (see api-spec.md, `LAST_ADMIN` error). |
| Admin deletes project and all documents | Accepted | This is a feature, not a bug -- admins have full control of their projects. A confirmation UI mitigates accidental deletion. |
| OAuth provider attacks | N/A | OAuth is not in P2 scope (email/password only). |
| Denial of service via bulk upload | Partial | Max 10 files per request, 20 MB per file. Additional rate limiting at deployment layer. |
| Stored XSS in document names or extracted text | Mitigated | All rendering in React escapes by default. Extracted text is plain text, not HTML. |

---

## 2. Authentication Architecture

### 2a. Auth Provider

**Supabase Auth** with email/password. The user's identity is represented by a row in `auth.users` (managed by Supabase). The session is a JWT stored in an HTTP-only cookie.

### 2b. Token Handling

| Property | Detail |
|---|---|
| Token type | Supabase-issued JWT (signed, short-lived) |
| Token storage | HTTP-only cookie managed by `@supabase/ssr` |
| Cookie name | `sb-{project-ref}-auth-token` (Supabase naming convention) |
| Cookie flags | `HttpOnly`, `Secure` (in production), `SameSite=Lax` |
| Token refresh | `middleware.ts` calls `getSession()` on every request to refresh expired tokens |
| Token exposure to JavaScript | None -- HTTP-only prevents `document.cookie` access |
| Token in API calls | Sent automatically via cookie on same-origin requests. No manual `Authorization` header needed. |

### 2c. Next.js Middleware

`middleware.ts` (project root):

- Runs on every request to the Next.js server.
- Creates a Supabase server client and calls `supabase.auth.getSession()`.
- This refreshes the cookie if the access token has expired (using the refresh token in the cookie).
- Does **NOT** perform redirects or role checks -- those happen in route handlers.
- Does **NOT** expose the session to the client (the cookie stays HTTP-only).

**Security consideration:** If `@supabase/ssr`'s `getSession()` fails (expired refresh token), the cookie is effectively invalid. The next route handler call to `getUser()` will return `null` and the handler will return 401.

### 2d. Route Handler Auth Pattern

Every protected route handler must follow this pattern:

```ts
// lib/auth.ts -- pseudocode (do not implement from docs)
export async function requireAuth(request: NextRequest) {
  const { supabase, response } = createServerClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user, response };
}
```

The route handler calls `requireAuth()` as its first operation. If `user` is null, it immediately returns the 401 response. No business logic runs before auth is verified.

---

## 3. RLS Policy Design

### 3a. Design Principles

1. **Defence in depth:** RLS is the last line of defence. Application code checks permissions first (for clear error messages), and RLS catches any application bugs.
2. **User identity via `auth.uid()`:** All RLS policies use `auth.uid()` to identify the current user. This function returns the UUID of the authenticated user from the JWT. It returns `NULL` for anon requests.
3. **Helper functions:** `get_user_tenant_id()` and `get_project_role(project_id)` encapsulate the profile and membership lookups so policies are readable and the lookup logic is in one place.
4. **Service role bypass:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS. This is intentional for admin operations (profile creation trigger, migration backfills). Application code must restrict service-role usage to those cases only.

### 3b. Policy Coverage Matrix

| Table | Operation | Policy Name | Who can do this |
|---|---|---|---|
| `tenants` | SELECT | `tenants_select_own` | Users who belong to the tenant |
| `tenants` | INSERT | `tenants_insert_auth` | Any authenticated user (during sign-up) |
| `profiles` | SELECT | `profiles_select_own` | The profile owner |
| `profiles` | UPDATE | `profiles_update_own` | The profile owner |
| `projects` | SELECT | `projects_select_member` | Project members |
| `projects` | INSERT | `projects_insert_auth` | Authenticated users (must match own tenant) |
| `projects` | UPDATE | `projects_update_admin` | Project admins |
| `projects` | DELETE | `projects_delete_admin` | Project admins |
| `project_members` | SELECT | `project_members_select_peer` | Members of the same project |
| `project_members` | INSERT | `project_members_insert_admin` | Project admins |
| `project_members` | UPDATE | `project_members_update_admin` | Project admins |
| `project_members` | DELETE | `project_members_delete_admin` | Project admins |
| `documents` | SELECT | `documents_select_member` | Project members |
| `documents` | INSERT | `documents_insert_editor` | Project admins or editors, must match `uploaded_by` |

### 3c. RLS Verification (for `security` agent)

The security agent must verify these scenarios:

| Test | Expected result |
|---|---|
| Anon user queries `documents` | Zero rows returned |
| User A queries their own documents | Returns only A's documents |
| User A queries with a `project_id` they are NOT a member of | Zero rows (or empty list) |
| User A (viewer) tries to INSERT into `documents` | Insert rejected by RLS |
| User A (editor) tries to UPDATE `project_members` | Update rejected by RLS |
| User A (admin) tries to INSERT into another tenant's project | Insert rejected by RLS (`tenant_id` mismatch) |
| Service-role client queries `documents` with no auth | All rows returned (expected -- service role bypass) |

The security agent should test these using the Supabase JS client with different auth states (anon, user A JWT, user B JWT, service-role key).

---

## 4. RBAC Enforcement

### 4a. Role Definitions

| Role | Create docs | View docs | Trigger compare | Manage members | Edit project | Delete project |
|---|---|---|---|---|---|---|
| **admin** | Yes | Yes | Yes | Yes | Yes | Yes |
| **editor** | Yes | Yes | Yes | No | No | No |
| **viewer** | No | Yes | Yes | No | No | No |

### 4b. Enforcement Layers

1. **UI layer** (frontend): Hides buttons/actions the user cannot perform. Not a security control -- pure UX. A malicious user can craft HTTP requests directly.
2. **Route handler layer** (backend): Checks the user's role in the target project before performing the operation. Returns 403 with a clear `code` if the role is insufficient.
3. **RLS layer** (database): Postgres policies reject INSERT/UPDATE/DELETE operations that do not match the required role. This is the guaranteed enforcement -- even if the route handler is buggy, the database rejects.

### 4c. Role Check Pattern in Route Handlers

```ts
// lib/auth.ts -- pseudocode
export async function requireProjectRole(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  allowedRoles: Role[]
): Promise<Role | null> {
  const { data: member } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (!member || !allowedRoles.includes(member.role as Role)) {
    return null;
  }
  return member.role as Role;
}
```

### 4d. Last Admin Protection

When an admin attempts to demote themselves or leave a project, the route handler checks whether other admins exist. If this is the last admin, the operation is blocked with `LAST_ADMIN`. This is enforced at the application layer (not RLS) because it requires a COUNT query across `project_members`.

---

## 5. Tenant Isolation Verification

### 5a. Isolation Guarantee

Every document is assigned a `tenant_id` at upload time (from the uploading user's `profiles.tenant_id`). The RLS policy on `documents` checks this value. Once set, `tenant_id` never changes. There is no API endpoint that moves a document between tenants.

### 5b. Verification Scenarios (for `security` agent)

| Scenario | Expected outcome |
|---|---|
| User in tenant A creates a project | Project has tenant A's `tenant_id` |
| User in tenant A uploads a document to their project | Document has tenant A's `tenant_id` and the project's `project_id` |
| User in tenant B queries all documents (no project filter) | Only sees documents in tenant B's projects (because of the project membership join in RLS) |
| User in tenant B tries to guess a document UUID from tenant A and calls `GET /api/documents/:id` | 404 (RLS filters out the row) |
| Admin in tenant A adds user from tenant B to their project | Blocked at app layer: `USER_NOT_IN_TENANT` error |
| A buggy route handler forgets to filter by tenant_id | RLS catches it -- `documents_select_member` policy only returns rows in projects the user belongs to |

### 5c. Data at Rest

All tenant data lives in the same Postgres database and the same Storage bucket. Isolation is logical (RLS, tenant_id column), not physical (separate databases per tenant). This is acceptable for P2 scope. For high-security deployments, separate Supabase projects per tenant or schema-level isolation could be added in a future phase.

---

## 6. Secret Management (Updated for P2)

### 6a. Environment Variables

| Variable | Sensitivity | Location | P2 Change |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Low (public) | `.env.local`, Vercel | No change |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Low (public) | `.env.local`, Vercel | Now used by browser Supabase client for auth (was server-only in P1). Still safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | **HIGH** | `.env.local`, Vercel (Sensitive) | **P2: Usage restricted** to admin ops only (profile creation trigger, backfill). Must NOT be used for user-facing queries. |
| `DEEPSEEK_API_KEY` | **HIGH** | `.env.local`, Vercel (Sensitive) | No change |

### 6b. P2 Rules (in addition to P1 rules)

1. The service-role client must only be instantiated in `lib/supabase/client.ts` via `createServiceClient()`.
2. No route handler may accept a `useServiceRole: boolean` parameter -- the choice of client is determined by the operation, not the request.
3. The anon key is now used by the browser Supabase client for `signUp()`, `signInWithPassword()`, etc. This is safe -- the anon key identifies the project but does not grant data access (RLS prevents anon access to all user-data tables).
4. All P1 secret rules still apply (no commits, no `NEXT_PUBLIC_` on sensitive vars).

### 6c. Supabase JWT Secret

The JWT signing secret is managed by Supabase and never leaves their infrastructure. The application never sees it. This is a security advantage of using Supabase Auth over a self-managed auth system.

---

## 7. AI Prompt Injection Risks (Unchanged from P1)

The risks and mitigations from P1 Section 6 apply identically in P2. The compare endpoint still embeds user-controlled PDF text into the DeepSeek prompt. P2 mitigations:

1. System prompt is fixed and prepended. User content goes in the user message only.
2. Zod schema validation on the AI response rejects non-conforming outputs.
3. Text truncation at 40,000 characters.
4. No secrets in the prompt.
5. Output treated as data, never executed.

P2 does NOT add new prompt injection vectors -- auth credentials are never placed in prompts, and the user identity is not passed to DeepSeek.

---

## 8. Input Validation (Updated for P2)

All P1 validation rules apply (file type magic-byte check, UUID format, size limits, parameterised queries). P2 adds:

### New Validations

| Endpoint | Input | Validation | Error |
|---|---|---|---|
| All | Session | Must have valid Supabase session | 401 |
| POST /api/projects | `name` | Non-empty, <= 255 chars | 400 |
| PATCH /api/projects/[id] | `name` | If provided, non-empty, <= 255 chars | 400 |
| POST /api/projects/[id]/members | `user_id` | Valid UUID | 400 |
| POST /api/projects/[id]/members | `role` | Must be `admin`, `editor`, or `viewer` | 400 |
| POST /api/documents | `project_id` | Valid UUID | 400 |
| GET /api/documents | `project_id` | Required, valid UUID | 400 |
| POST /api/documents/bulk | `files` | 1-10 files, each <= 20 MB | 400 |
| POST /api/documents/bulk | `names` | If provided, valid JSON array of strings | 400 |
| POST /api/compare | Cross-project | Both docs must have same `project_id` | 400 |

### SQL Injection Prevention (Unchanged)

All queries use the Supabase JS client's parameterised methods. No raw SQL string concatenation with user input. The `ILIKE` search parameter is bound via `.ilike('name', `%${search}%`)` which handles escaping.

---

## 9. Rate Limiting (P2 Guidance)

P2 does not implement application-level rate limiting. This is deferred to the deployment layer. Recommendations for the `deployment` agent:

| Endpoint group | Suggested limit | Rationale |
|---|---|---|
| `/api/auth/*` | 20 req/min per IP | Supabase Auth handles brute-force internally; this is a secondary layer |
| `/api/documents/bulk` | 5 req/min per user | Bulk uploads are expensive (multiple Storage + DB writes) |
| `/api/compare` | 10 req/min per user | Each compare may trigger a paid AI API call |
| `/api/*` (general) | 60 req/min per IP | General baseline |

These limits can be implemented via Vercel WAF rules or a reverse proxy. They are not enforced in application code for P2.

---

## 10. Empty and Corrupt PDF Handling (Unchanged)

The behaviour from P1 Section 7 applies identically. `extractPdfText()` never throws; returns `""` for corrupt/empty PDFs. The compare pipeline handles this correctly via hash comparison.

---

## 11. Never-Do List (Updated for P2)

All P1 "Never-Do" items remain in effect. P2 adds:

9. **Never use the service-role client for user-facing queries.** It bypasses RLS and destroys tenant isolation.
10. **Never create a Supabase client with `auth: { persistSession: false }` in the browser** -- it would prevent the session cookie from being set and break auth.
11. **Never pass `user.id` from the client as a trusted parameter.** Always derive the user ID from the session JWT in the route handler via `supabase.auth.getUser()`. A malicious client could send someone else's ID.
12. **Never skip the cross-project check in `/api/compare`.** Comparing documents across projects would leak information about document count/existence in other projects via the error message.
13. **Never log session tokens or cookies.**
14. **Never expose `SUPABASE_SERVICE_ROLE_KEY` in any client-side code or env var with `NEXT_PUBLIC_` prefix.**

---

## 12. P1 Baseline (Preserved)

All P1 security rules (Sections 1-8 from the P1 document) that do not conflict with P2 additions remain valid. In particular:
- Secret management rules (Section 2 of P1).
- Input validation patterns (Section 4 of P1, extended above).
- SQL injection prevention (Section 5 of P1).
- AI prompt injection mitigations (Section 6 of P1).
- Empty/corrupt PDF handling (Section 7 of P1).
- Original "Never-Do" items 1-8 (Section 8 of P1).

---

## 13. Security Audit Checklist (for `security` agent)

The P2 security audit must verify:

### Auth
- [ ] All API endpoints (except Supabase-managed auth) return 401 when called without a valid session.
- [ ] `middleware.ts` refreshes the session cookie and does not expose it to client code.
- [ ] `lib/supabase/client.ts` never creates a service-role client from request context (only user-scoped).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only referenced in `createServiceClient()`.

### RLS & Tenant Isolation
- [ ] RLS is enabled on all tables: `tenants`, `profiles`, `projects`, `project_members`, `documents`.
- [ ] Anon queries to any table return zero rows.
- [ ] User A cannot see user B's documents or projects.
- [ ] User A cannot insert documents into a project they are not a member of.
- [ ] A viewer cannot upload a document (insert rejected by RLS).
- [ ] An editor cannot change project members (update rejected by RLS).

### RBAC
- [ ] Viewer can GET documents and compare but cannot POST documents.
- [ ] Editor can GET and POST documents but cannot PATCH project or manage members.
- [ ] Admin can perform all project operations.
- [ ] Last admin cannot be removed or demoted.

### Secret Safety
- [ ] `git grep "SUPABASE_SERVICE_ROLE_KEY"` finds only server-side files and docs.
- [ ] `git grep "DEEPSEEK_API_KEY"` finds only server-side files and docs.
- [ ] No `NEXT_PUBLIC_` prefix on sensitive variables.
- [ ] `.env.local` is gitignored.

### Input Validation
- [ ] All endpoints validate UUID format on path parameters.
- [ ] File upload validates magic bytes (`%PDF`).
- [ ] Cross-project comparison is blocked with a clear error.
- [ ] SQL queries use parameterised methods (no raw string concat).

---

## 14. P5 Blockchain Anchoring Security

### 14a. Threat Model (P5 Additions)

P5 introduces blockchain interaction, private key management, and an on-chain smart contract. The threat surface expands beyond the web application to include the anchoring signer account, the RPC connection, and the smart contract itself.

| Threat | Control |
|---|---|
| Private key exfiltration via env var leak | `ANCHOR_PRIVATE_KEY` is never prefixed with `NEXT_PUBLIC_`. It is read only by server-side code (`lib/anchor.ts`). It is never included in client bundles, never logged, never sent to the browser. |
| Private key exfiltration via Vercel env var exposure | `ANCHOR_PRIVATE_KEY` is marked as **Sensitive** in Vercel environment variables. It is not exposed in build logs or preview deployments. |
| Private key exfiltration via source code leak | `.env.local` is gitignored. The private key never appears in committed code. `git grep "ANCHOR_PRIVATE_KEY"` must return zero results in committed files. |
| Transaction signing by unauthorized party | All anchor transactions are initiated from server-side API route handlers, which require a valid Supabase session + project editor/admin role. There is no client-side path to trigger an anchor transaction. |
| Replay attacks (double-anchor of the same fingerprint) | Smart contract enforces `require(anchoredAt[fingerprint] == 0, "Already anchored")`. Once set, the fingerprint mapping is immutable. The database also enforces `UNIQUE (fingerprint)`. |
| RPC man-in-the-middle | The RPC URL is configured via env var. For production, always use HTTPS endpoints (Infura, Alchemy, QuickNode). The viem `http` transport uses HTTPS. For Anvil (local dev), the RPC is on `localhost` -- not exposed to the network. |
| Smart contract re-entrancy | Not applicable. The `anchor()` function has no external calls before state change. The single SSTORE happens after the require check, which is a read-only check on the same mapping. |
| Smart contract upgrade/replacement | `TrustVaultAnchor` has no upgrade mechanism (no proxy, no `selfdestruct`, no owner). The contract is immutable once deployed. If a new contract is needed, deploy a new instance and update `ANCHOR_CONTRACT_ADDRESS`. Documents anchored to the old contract remain verifiable against the old contract address. |
| Chain reorg removes an anchor transaction | Accepted risk for P5. On Anvil (single node, no reorgs) this is impossible. On public testnets/mainnets, wait for sufficient block confirmations. The frontend can poll `POST /api/verify` after anchoring to confirm. For production, the `waitForTransactionReceipt` with a configurable number of confirmations provides reasonable assurance. |
| Fingerprint collision (two different (binary_hash, text_hash) pairs produce the same keccak256 output) | Relies on keccak256's collision resistance. The probability of a random collision in a 256-bit space is negligible (~1 in 2^128 with birthday bound). Not a practical threat. |
| Signer account drained (gas theft) | The signer account holds only enough ETH for gas. It is not used for any other purpose. Use a dedicated account with a minimal balance. On Anvil, prefunded accounts have 10,000 test ETH -- acceptable for dev. For production testnet/mainnet, fund only enough for expected anchor volume (estimate 22,000 gas per anchor at current gas price). |
| Cross-chain confusion (document anchored on chain A but verified against chain B) | The `chain` column records which chain the document was anchored on. The verify endpoint uses the SAME chain as was used for anchoring (reads `document.chain` to determine which AnchorService to use -- in P5, there is only one configured chain, so this is not an issue. In a future multi-chain setup, the `chain` column disambiguates). |
| Smart contract storage collision (fingerprint mapping slot predictable) | Not a security concern. The mapping is keyed by bytes32 (keccak256 output). Storage slot computation is deterministic and collision-resistant. |
| Denial of service via excessive anchor requests | Rate limiting at the deployment layer. Each anchor costs gas, which is paid by the server's signer account. Excessive requests could drain the gas balance. The recommended mitigation is a per-user rate limit on `POST /api/anchor` (e.g., 10 anchors per minute per user). |

### 14b. Private Key Protection (Critical)

The `ANCHOR_PRIVATE_KEY` environment variable is the most sensitive secret in P5. Compromise means an attacker can submit arbitrary anchor transactions from the server's identity.

**Hard rules:**

1. **Never prefix with `NEXT_PUBLIC_`.** Next.js inlines all `NEXT_PUBLIC_*` env vars into the client bundle at build time. `ANCHOR_PRIVATE_KEY` must be a plain server-side env var.
2. **Never log the key.** Do not `console.log(process.env.ANCHOR_PRIVATE_KEY)` anywhere. Do not include it in error messages.
3. **Never expose in API responses.** The `AnchorResponse` returns `fingerprint`, `chain`, `txHash`, `anchoredAt`, and `verified`. It does NOT return the private key or any derivative.
4. **Use a dedicated account.** The private key should control an account used exclusively for TrustVault anchoring. It should not hold significant funds beyond gas requirements.
5. **Rotate periodically (future).** When KMS is implemented, key rotation becomes trivial. For the raw private key approach in P5, rotation requires deploying a new signer account, funding it, and updating `ANCHOR_PRIVATE_KEY`.

### 14c. Server-Side Execution Guarantee

The anchor transaction is assembled, signed, and broadcast entirely on the server:

```
Browser (client)           Next.js Server              Blockchain
    |                           |                          |
    |-- POST /api/anchor ------>|                          |
    |  { documentId }          |                          |
    |                           |-- compute fingerprint    |
    |                           |-- build tx (viem)        |
    |                           |-- sign with private key  |
    |                           |-- broadcast tx --------->|
    |                           |<-- txHash ---------------|
    |                           |-- wait for receipt ------>|
    |                           |<-- receipt --------------|
    |                           |-- update DB              |
    |<-- 201 { response } ------|                          |
```

**No browser code path exists that constructs, signs, or broadcasts an anchor transaction.** The `ANCHOR_PRIVATE_KEY` is only referenced in `lib/anchor.ts`, which is only imported by `app/api/anchor/route.ts` and `scripts/deploy-anchor.ts`, both of which are server-side only.

The `security` agent must verify:
- `git grep "ANCHOR_PRIVATE_KEY" -- "*.tsx"` returns zero results (no usage in React components).
- `git grep "NEXT_PUBLIC_ANCHOR"` returns zero results (no public exposure of anchor env vars).
- The `viem` wallet client is only constructed in `lib/anchor.ts`, not in any client-side module.

### 14d. Transaction Safety

**Simulate before send:** The `EvmAnchorService.anchor()` method calls `simulateContract()` before `writeContract()`. This catches reverts (e.g., "Already anchored") without spending gas. The simulation result is not acted upon beyond checking for revert -- it is not trusted for state (only the actual transaction outcome matters).

**Gas estimation:** viem's `writeContract()` automatically estimates gas. The signer account pays actual gas used. No manual gas limit is set (viem's default estimation is reliable for simple SSTORE operations).

**Nonce management:** viem's `WalletClient` manages nonces automatically via `getTransactionCount`. No manual nonce tracking is needed for the single-signer, sequential-request model in P5.

### 14e. Fingerprint Integrity

The fingerprint computation is deterministic and must be identical off-chain (viem) and on-chain (Solidity). Any discrepancy means the verification is broken.

**Guarantee:** Both viem's `keccak256(encodePacked(...))` and Solidity's `keccak256(abi.encodePacked(...))` use the same algorithm (Keccak-256) and the same packing rules (tight packing, no padding). The inputs are the same: two bytes32 values derived from the document's `binary_hash` and `text_hash`.

The `qa` agent must write an eval test that:
1. Takes known `binary_hash` and `text_hash` values.
2. Computes the fingerprint via `computeFingerprint()`.
3. Verifies it against a precomputed Solidity output (hardcoded in the test).

### 14f. RLS Policy for Anchor Updates

P5 adds a new RLS policy (`documents_update_anchor`) that allows editors and admins to UPDATE the anchoring columns on documents in their projects. The `security` agent must verify:

- [ ] A viewer cannot anchor a document (UPDATE rejected by RLS).
- [ ] A user outside the project cannot anchor a document.
- [ ] An anon user cannot anchor a document.
- [ ] The UPDATE policy allows only the anchoring columns to be modified at the application level (the route handler must explicitly list which columns to SET). RLS itself does not restrict which columns are updated -- this is an application-layer concern.

### 14g. Security Audit Checklist Additions (for `security` agent)

#### Private Key Safety
- [ ] `git grep "ANCHOR_PRIVATE_KEY" -- "*.tsx"` returns zero results.
- [ ] `git grep "NEXT_PUBLIC_ANCHOR"` returns zero results.
- [ ] `ANCHOR_PRIVATE_KEY` is marked as **Sensitive** in Vercel environment variables.
- [ ] `.env.local` is gitignored (confirm P1 rule still holds).
- [ ] No `console.log` or `console.error` statements include `ANCHOR_PRIVATE_KEY` or any key material.

#### Transaction Safety
- [ ] `lib/anchor.ts` uses `simulateContract()` before `writeContract()`.
- [ ] `lib/anchor.ts` uses `waitForTransactionReceipt()` after sending.
- [ ] The signer account (from `ANCHOR_PRIVATE_KEY`) has a balance sufficient for expected anchor volume.

#### Smart Contract Safety
- [ ] `TrustVaultAnchor.sol` uses Solidity ^0.8.20 (built-in overflow protection).
- [ ] `anchor()` has no external calls before state change (re-entrancy safe).
- [ ] `require(anchoredAt[fingerprint] == 0)` prevents overwrites.
- [ ] No `selfdestruct`, no proxy/upgrade mechanism, no owner role.
- [ ] The contract compiles without warnings (`solc` or `forge build`).

#### RLS
- [ ] The `documents_update_anchor` policy exists and is enabled.
- [ ] A viewer cannot UPDATE anchoring columns (RLS test).
- [ ] An anon user cannot UPDATE anchoring columns (RLS test).

#### Verification Flow
- [ ] `POST /api/verify` correctly detects `not_anchored` (never anchored).
- [ ] `POST /api/verify` correctly detects `hash_mismatch` (tampered after anchoring).
- [ ] `POST /api/verify` correctly detects `not_on_chain` (fingerprint in DB but not on chain).
- [ ] `POST /api/verify` returns `ok` for intact documents.

#### Never-Do Additions (P5)
15. **Never log `ANCHOR_PRIVATE_KEY` or include it in error messages.**
16. **Never create an `ANCHOR_PRIVATE_KEY` env var with the `NEXT_PUBLIC_` prefix.**
17. **Never commit a `.env.local` file or any file containing a real private key.**
18. **Never allow the browser to construct or sign an anchor transaction.**
19. **Never modify `binary_hash` or `text_hash` after a document has been anchored.** Anchoring creates a permanent cryptographic link between those hashes and the on-chain fingerprint.

---

## 15. P14 RBAC Security

### 15a. Threat Model (P14 Additions)

P14 introduces tenant-level role-based access control and an email-based invitation system. The threat surface expands to include privilege escalation through role manipulation, invitation token forgery, and unauthorized tenant membership changes.

| Threat | Control |
|---|---|
| Viewer/editor elevates their own role | Route handler checks caller is admin/owner before allowing any role change. RLS on `profiles` update (existing `profiles_update_own` policy only allows updating own display_name -- not role). Role changes must go through `PATCH /api/tenant/members/[userId]` which enforces admin/owner check. No self-service role change endpoint exists. |
| Admin changes owner's role or removes owner | Route handler explicitly checks `target.role !== 'owner'`. Returns 403 `CANNOT_MODIFY_OWNER` or `CANNOT_REMOVE_OWNER`. |
| Admin changes another admin's role | Route handler checks: if caller is `'admin'` and target is `'admin'`, returns 403 `ADMINS_CANNOT_MODIFY_ADMINS`. Only the owner can manage admins. |
| Admin invites someone as admin | Route handler checks: if caller is `'admin'` and requested role is `'admin'`, returns 403 `ADMINS_CANNOT_INVITE_ADMINS`. |
| Last admin removes themselves | Route handler counts remaining admins/owners. If caller is the last one, returns 400 `LAST_ADMIN`. |
| Invitation token brute-force | 256 bits of entropy (`crypto.randomBytes(32)`). 2^256 possible tokens. Brute-force is computationally infeasible. Additionally, tokens are single-use and expire after 7 days. |
| Invitation token leakage (e.g., email intercepted) | The token alone is insufficient to join -- the accepting user must be authenticated with an email matching the invitation's email. An attacker who steals a token but cannot authenticate as the invitee's email cannot use it. Also, the invitee must not already belong to a tenant. |
| Expired invitation replay | `expires_at` is checked on every join attempt. Expired invitations return 410. |
| Accepted invitation replay | `accepted_at IS NOT NULL` check returns 409 for already-accepted invitations. Token is single-use. |
| User joins a tenant they already belong to | `ALREADY_IN_TENANT` check prevents the join. |
| User in tenant A accepts invitation to tenant B | Check: if user already has `profiles.tenant_id` set, return 409 `ALREADY_IN_TENANT`. A user can only belong to one tenant. |
| Attacker invites themselves to gain write access | Only admins/owners can create invitations (route handler gated + RLS policy `invitations_insert_admin`). |
| Deleted/removed member retains access via cached session | Supabase JWTs are short-lived. The Next.js middleware refreshes sessions, and `requireAuth()` fetches the latest profile on each request. If a user's `tenant_id` is set to NULL (removed), subsequent queries will find no tenant and return 403. The user's JWT itself remains valid (they can still call `GET /api/profile`), but all tenant-scoped operations fail. |
| Service-role misuse in join endpoint | The service-role client is used ONLY for two operations in `GET /api/tenant/join`: (1) updating `profiles.tenant_id` and `profiles.role`, and (2) setting `invitations.accepted_at`. These operations require the service-role client because the accepting user does not yet have a tenant_id to satisfy user-scoped RLS on the invitations table. The route handler validates the token, email match, and expiry BEFORE using the service-role client. The service-role client is NOT used for any other invitation or member operation. |

### 15b. Role Enforcement Layers

RBAC is enforced at two layers (defence in depth):

**Layer 1 -- Route Handler (application code):**
- Every protected route handler calls `requireTenantRole(userId, tenantId, allowedRoles)` before executing business logic.
- Returns 403 with a specific `code` if the role is insufficient.
- Enforces owner immutability and admin-to-admin restrictions (business rules that RLS cannot express).

**Layer 2 -- RLS (database):**
- `documents_tenant_insert` policy: checks `profiles.role IN ('owner', 'admin', 'editor')`.
- `documents_tenant_update` policy: checks `profiles.role IN ('owner', 'admin', 'editor')`.
- `document_chunks_tenant_insert` / `document_chunks_tenant_delete`: same check.
- `document_labels_insert_editor` / `document_labels_delete_editor`: checks role.
- `invitations_insert_admin` / `invitations_delete_admin`: checks `profiles.role IN ('owner', 'admin')`.
- `profiles_update_own` policy: only allows updating `display_name` -- the `role` column cannot be changed via a direct PATCH to `/api/profile`. Role changes must go through the dedicated admin endpoint.

**Why both layers are needed:**
- Route handler gives clear error messages to legitimate users (403 with a descriptive code vs. opaque RLS rejection).
- RLS catches bugs in the route handler. Even if a handler forgets to call `requireTenantRole()`, the database rejects unauthorized writes.

### 15c. Invitation Token Security

**Token generation:**
```
crypto.randomBytes(32).toString('hex')  // 64-character hex string, 256 bits of entropy
```

**Why `crypto.randomBytes`:**
- Uses the system's cryptographically secure PRNG (`/dev/urandom` on Linux, `BCryptGenRandom` on Windows). Not Math.random().
- 32 bytes = 256 bits. Birthday bound for collision is ~2^128. For all practical purposes, tokens are globally unique.
- Hex encoding is URL-safe and case-insensitive. No base64 encoding quirks.

**Token lifecycle:**
1. Generated on the server during `POST /api/tenant/invite`.
2. Stored in the `invitations.token` column (hashed? No -- tokens are not secrets in the traditional sense. They are single-use, time-limited, and require email matching. Hashing would prevent looking up the invitation by token on accept. The token is treated as a bearer capability, not an authentication secret).
3. Delivered to the invitee via email. The token appears in the URL: `{APP_URL}/join?token={token}`.
4. On accept, the token is validated (exists, not expired, not used) and the invitation is marked `accepted_at = now()`.
5. After acceptance (or expiry), the token has no value. It is never returned in API responses.

**Token in the URL -- acceptable risk:**
- The token appears in the browser URL bar and may be logged in server access logs.
- Mitigation: tokens are single-use. Even if a token leaks via logs, the legitimate user will likely use it first. If an attacker uses it first, the legitimate user gets 409 `INVITATION_ALREADY_ACCEPTED` and can request a new invitation.
- Future enhancement (not in P14): rate-limit join attempts per token to prevent rapid brute-force of the email match.

**Expiry enforcement:**
- `expires_at` is set to `created_at + 7 days`. Stored in the database.
- Checked at accept time: `if (invitation.expires_at < new Date()) -> 410 INVITATION_EXPIRED`.
- Expired invitations are not automatically purged from the database (kept for audit trail). They are simply rejected at accept time.

### 15d. Owner Protection Rules

The owner role has special protections that prevent accidental or malicious lockout:

| Rule | Enforcement |
|---|---|
| Owner cannot be demoted | `PATCH /api/tenant/members/[userId]` returns 403 `CANNOT_MODIFY_OWNER` if target role is `'owner'`. |
| Owner cannot be removed | `DELETE /api/tenant/members/[userId]` returns 403 `CANNOT_REMOVE_OWNER` if target role is `'owner'`. |
| Owner role cannot be assigned via invitation | `POST /api/tenant/invite` validates `role` against CHECK constraint (`admin`, `editor`, `viewer` only). `'owner'` is not in the allowed set. |
| Owner role cannot be set via role change | `PATCH /api/tenant/members/[userId]` validates `role` against `['admin', 'editor', 'viewer']`. `'owner'` is not accepted. |
| Exactly one owner per tenant (by convention) | The `handle_new_user` trigger creates exactly one owner per new tenant. Existing tenants have the earliest profile backfilled as owner. No API endpoint can create a second owner. Application-layer convention (not a DB constraint) maintains the single-owner invariant. |

**Owner transfer (not in P14):** There is no owner transfer mechanism. If the owner needs to be changed, it must be done directly in the database. A future phase may add an explicit owner transfer flow.

### 15e. Last Admin Protection

Prevents an admin from accidentally locking the tenant out of administrative access:

| Scenario | Enforcement |
|---|---|
| Admin demotes themselves to editor/viewer | `PATCH /api/tenant/members/[userId]` counts remaining admins/owners. If self-demotion would leave zero admins/owners, returns 400 `LAST_ADMIN`. |
| Admin removes themselves from tenant | `DELETE /api/tenant/members/[userId]` counts remaining admins/owners. If self-removal would leave zero admins/owners, returns 400 `LAST_ADMIN`. |

**How the count works:**
```sql
SELECT COUNT(*) FROM public.profiles
WHERE tenant_id = :tenantId
  AND role IN ('owner', 'admin')
  AND id != :callingUserId;
```
If the count is 0, the operation is blocked.

**Note:** This is enforced at the application layer only (route handler). RLS does not enforce this because it requires a multi-row COUNT. The database layer relies on the fact that an admin cannot directly UPDATE their own `role` (the `profiles_update_own` RLS policy only allows updating `display_name`). The admin must go through `PATCH /api/tenant/members/[userId]`, which applies the count check.

### 15f. Service-Role Usage in P14

The service-role client (`SUPABASE_SERVICE_ROLE_KEY`) is used in two specific P14 operations. This is an expansion of its previous use (profile creation trigger only).

| Operation | Location | Justification |
|---|---|---|
| Update `profiles.tenant_id` and `profiles.role` on join | `GET /api/tenant/join` | The accepting user does not yet have a `tenant_id` set on their profile. User-scoped RLS on profiles (`profiles_select_own`, `profiles_update_own`) would still work (the user owns their profile via `id = auth.uid()`). However, to be explicit and avoid any RLS edge cases, the join handler uses service-role. |
| Set `invitations.accepted_at` on join | `GET /api/tenant/join` | The invitations table has RLS that requires `tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())`. The accepting user has no tenant_id at this point, so their user-scoped client cannot UPDATE the invitations row. The service-role client bypasses this. |
| Remove member's tenant membership | `DELETE /api/tenant/members/[userId]` | When removing a member, the target user's `tenant_id` is set to NULL and `role` to `'viewer'`. The user-scoped client with RLS may have edge cases when updating a row that changes `tenant_id`. Using service-role for this specific UPDATE ensures the removal completes cleanly. The route handler has already verified the caller is admin/owner. |

**Hard rules for service-role usage in P14:**
1. The service-role client must NEVER be used in a general-purpose way in P14 route handlers.
2. It is only used for the three specific operations listed above.
3. Before any service-role operation, the route handler must complete all authorization checks (token validation, email match, admin/owner role check, owner protection, last-admin check).
4. The service-role client is never exposed to the browser or returned in API responses.

### 15g. Security Audit Checklist Additions (P14)

#### RBAC Enforcement
- [ ] Viewer cannot call `POST /api/documents` (returns 403).
- [ ] Viewer cannot call `PATCH /api/documents/[id]` (returns 403).
- [ ] Viewer cannot call `POST /api/anchor` (returns 403).
- [ ] Viewer cannot call `POST /api/assistant/ingest` (returns 403).
- [ ] Editor cannot call `GET /api/tenant/members` (returns 403).
- [ ] Editor cannot call `POST /api/tenant/invite` (returns 403).
- [ ] Admin cannot change owner's role (returns 403 `CANNOT_MODIFY_OWNER`).
- [ ] Admin cannot remove owner (returns 403 `CANNOT_REMOVE_OWNER`).
- [ ] Admin cannot change another admin's role (returns 403 `ADMINS_CANNOT_MODIFY_ADMINS`).
- [ ] Admin cannot invite as admin (returns 403 `ADMINS_CANNOT_INVITE_ADMINS`).
- [ ] Last admin cannot demote themselves (returns 400 `LAST_ADMIN`).
- [ ] Last admin cannot remove themselves (returns 400 `LAST_ADMIN`).

#### RLS Verification
- [ ] Viewer cannot INSERT into `documents` (RLS rejects).
- [ ] Viewer cannot UPDATE `documents` (RLS rejects).
- [ ] Viewer cannot INSERT into `document_chunks` (RLS rejects).
- [ ] Viewer cannot DELETE from `document_chunks` (RLS rejects).
- [ ] Non-admin cannot INSERT into `invitations` (RLS rejects).
- [ ] Non-admin cannot DELETE from `invitations` (RLS rejects).
- [ ] User cannot UPDATE their own `profiles.role` via direct profile PATCH (RLS `profiles_update_own` only allows `display_name`).

#### Invitation Security
- [ ] `POST /api/tenant/invite` returns 403 for viewers and editors.
- [ ] Token is not returned in the API response body.
- [ ] Expired invitation returns 410 `INVITATION_EXPIRED`.
- [ ] Already-accepted invitation returns 409 `INVITATION_ALREADY_ACCEPTED`.
- [ ] Email mismatch returns 403 `EMAIL_MISMATCH`.
- [ ] User already in tenant cannot join another (409 `ALREADY_IN_TENANT`).
- [ ] Admin cannot invite as admin (403 `ADMINS_CANNOT_INVITE_ADMINS`).

#### Service-Role Safety
- [ ] Service-role client is only used in the three operations listed in Section 15f.
- [ ] `git grep "createServiceClient"` finds only `lib/supabase/client.ts`, `GET /api/tenant/join`, and `DELETE /api/tenant/members/[userId]`.

#### Never-Do Additions (P14)
20. **Never allow a viewer or editor to change any user's role.**
21. **Never allow the owner's role to be changed or the owner to be removed.**
22. **Never allow an admin to change another admin's role or remove another admin.**
23. **Never allow an admin to invite someone as admin.**
24. **Never return the invitation token in any API response.** The token is delivered via email only.
25. **Never use the service-role client without completing all authorization checks first.**
26. **Never allow a user to belong to more than one tenant.**
