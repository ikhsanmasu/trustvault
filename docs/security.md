# TrustVault -- Security Model (P2)

This document is a **contract** for the `security` audit agent and a reference for `backend` and `deployment`. It defines the accepted threat model for P2 and the controls in place. P1 sections that remain valid are noted as preserved.

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
