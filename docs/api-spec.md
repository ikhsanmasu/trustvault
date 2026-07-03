# inTrustVault -- API Specification (P5)

This document is a **contract**. The `backend` agent implements exactly what is written here and the `frontend` agent calls exactly what is written here. Neither agent may silently change paths, field names, or types -- discrepancies must be flagged back to the architect.

---

## Conventions (Updated for P2)

- All endpoints are under `/api/`.
- Request bodies (where applicable) use `Content-Type: application/json` except where `multipart/form-data` is noted.
- All successful responses return `Content-Type: application/json`.
- Timestamps are ISO 8601 strings in UTC (e.g. `"2026-06-21T10:00:00.000Z"`).
- UUIDs are lowercase hyphenated strings (e.g. `"550e8400-e29b-41d4-a716-446655440000"`).
- Type annotations use TypeScript notation. `?` suffix means optional.
- **P2: All endpoints except auth-callback helpers require a valid Supabase session.** Auth is via HTTP-only cookie managed by `@supabase/ssr`. There is no `Authorization` header to send -- the cookie is sent automatically by the browser on same-origin requests.

### Auth Context (P2)

Every route handler begins by calling `requireAuth()` (see `architecture.md` Section 5, `lib/auth.ts`), which:

1. Creates a Supabase server client from the request cookies via `@supabase/ssr`.
2. Calls `supabase.auth.getUser()` to validate the session.
3. Returns the user object (containing `id`, `email`) or sends a 401 response.

**The frontend must NOT manually attach auth headers.** The Supabase client in the browser automatically manages the session cookie. For server-side API calls from the browser, use `fetch()` directly (cookies are sent automatically for same-origin requests) or the Supabase browser client's session to retrieve the access token.

### Standard Error Shape

All error responses use this shape:

```ts
type ErrorResponse = {
  error: string;   // human-readable message
  code?: string;   // machine-readable code (see per-endpoint error codes)
};
```

### HTTP Status Codes (Updated for P2)

| Status | Meaning |
|---|---|
| 200 | Success (GET, POST compare, PATCH) |
| 201 | Created (POST documents) |
| 400 | Bad request (validation failure) |
| 401 | Unauthenticated -- no valid session |
| 403 | Forbidden -- authenticated but insufficient role/permission |
| 404 | Resource not found |
| 413 | File too large |
| 415 | Unsupported media type |
| 500 | Internal server error |

---

## Shared Types

```ts
// ===== Auth & Profile =====

type Profile = {
  id: string;           // UUID, equals auth.users.id
  tenant_id: string;    // UUID
  display_name: string | null;
  role: TenantRole;     // P14: tenant-level role
  created_at: string;   // ISO 8601 UTC
};

type TenantRole = 'owner' | 'admin' | 'editor' | 'viewer';

// ===== Documents =====

type Document = {
  id: string;             // UUID
  name: string;           // user-supplied display name
  storage_path: string;   // path within the pdf-uploads bucket
  binary_hash: string;    // SHA-256 hex of raw file bytes (64 chars)
  text_hash: string;      // SHA-256 hex of extracted text (64 chars)
  extracted_text: string; // full extracted text (may be empty string)
  file_size_bytes: number;
  tenant_id: string;      // UUID
  uploaded_by: string;    // UUID of auth.users
  created_at: string;     // ISO 8601 UTC
};

// ===== Compare (unchanged from P1) =====

type CompareResult = {
  docAId: string;
  docBId: string;
  stage: 'BINARY_MATCH' | 'TEXT_MATCH' | 'AI_COMPARE';
  verdict: 'IDENTICAL' | 'BINARY_DIFF_ONLY' | 'MATERIAL' | 'NOT_MATERIAL';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reasoning: string | null;
};

// ===== Bulk Upload =====

type BulkUploadItem = {
  status: 'ok' | 'error';
  document?: Document;      // present on success
  error?: string;           // human-readable error message on failure
  code?: string;            // machine-readable error code on failure
  name?: string;            // the file name that was processed
};

type BulkUploadResult = {
  tenant_id: string;
  results: BulkUploadItem[];
  succeeded: number;
  failed: number;
};
```

---

## Endpoint Index

| Method | Path | Auth | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/api/profile` | Yes | -- | Get current user's profile |
| `POST` | `/api/documents` | Yes | editor/admin/owner | Upload a single document |
| `GET` | `/api/documents` | Yes | viewer+ | List documents |
| `POST` | `/api/documents/bulk` | Yes | editor/admin/owner | Upload multiple documents |
| `GET` | `/api/documents/[id]` | Yes | viewer+ | Get single document |
| `POST` | `/api/compare` | Yes | viewer+ | Compare two documents |

---

## Endpoints

---

### GET /api/profile

Return the authenticated user's profile, including their tenant.

#### Request

`Content-Type: none` (GET, no body)

#### Processing

1. `requireAuth()` -- get the current user. Return 401 if no session.
2. Query `profiles` where `id = user.id`.
3. Return 404 if no profile exists (should not happen if sign-up flow is correct).
4. Return 200 with the profile.

#### Response -- 200 OK

```ts
type GetProfileResponse = {
  profile: Profile;
};
```

Example:
```json
{
  "profile": {
    "id": "550e8400-...",
    "tenant_id": "3f2504e0-...",
    "display_name": "Alice",
    "created_at": "2026-06-21T10:00:00.000Z"
  }
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Profile row does not exist |
| 500 | `DB_ERROR` | Postgres query failed |

---

### POST /api/documents

Upload a single PDF document. Requires auth and tenant-level role check.

#### Request

`Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File (PDF) | Yes | The PDF file. Max 20 MB. Must be `application/pdf`. |
| `name` | string | Yes | Display name (1-255 characters). |

#### Processing (in order)

1. `requireAuth()` -- return 401 if no session.
2. Validate that `file` is present and `Content-Type` is `application/pdf`.
3. Validate file size <= 20 MB. Return 413 if exceeded.
4. Validate `name` is non-empty, max 255 characters.
5. **Role check:** `requireTenantRole(user.id, ['owner', 'admin', 'editor'])`. Return 403 if insufficient.
6. Get user's `tenant_id` from `profiles`.
7. Read the file into a `Buffer`.
8. `computeBinaryHash(buffer)` -> `binaryHash`.
9. `extractPdfText(buffer)` -> `extractedText`.
10. `computeTextHash(extractedText)` -> `textHash`.
11. Generate storage path: `uploads/{UTC_year}/{tenant_id}/{uuid}.pdf`.
12. Upload buffer to Supabase Storage bucket `pdf-uploads` using the **user-scoped** client.
13. INSERT into `documents` with `tenant_id` and `uploaded_by = user.id`.
14. Return 201.

#### Response -- 201 Created

```ts
type UploadResponse = {
  document: Document;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `MISSING_FILE` | No `file` field in form data |
| 400 | `MISSING_NAME` | `name` missing or empty |
| 400 | `NAME_TOO_LONG` | `name` > 255 characters |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not have editor/admin/owner role |
| 413 | `FILE_TOO_LARGE` | File > 20 MB |
| 415 | `INVALID_FILE_TYPE` | File is not `application/pdf` |
| 500 | `STORAGE_ERROR` | Supabase Storage upload failed |
| 500 | `DB_ERROR` | Postgres insert failed |

---

### GET /api/documents

List documents. Requires auth. Scoped to user's tenant via RLS.

#### Request

`Content-Type: none` (GET with query parameters)

| Query param | Type | Required | Description |
|---|---|---|---|
| `search` | string | No | Case-insensitive substring match against `documents.name`. |
| `limit` | number | No | Max results. Default: 50. Max: 200. |
| `offset` | number | No | Rows to skip. Default: 0. |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get user's `tenant_id` from `profiles`.
3. Query `documents` where `tenant_id = :tenantId`.
4. Apply `search` filter on `name` if provided (ILIKE).
5. Order by `created_at DESC`.
6. Apply `LIMIT` and `OFFSET`.
7. Return the list.

#### Response -- 200 OK

```ts
type ListDocumentsResponse = {
  documents: Document[];
  total: number;   // total matching rows (ignoring limit/offset)
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_LIMIT` | `limit` not a positive integer or exceeds 200 |
| 400 | `INVALID_OFFSET` | `offset` not a non-negative integer |
| 401 | `UNAUTHORIZED` | No valid session |
| 500 | `DB_ERROR` | Postgres query failed |

---

### GET /api/documents/[id]

Fetch a single document by UUID. Requires auth. RLS enforces access.

#### Request

`Content-Type: none` (GET with path parameter)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The document UUID |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Query `documents` where `id = :id`. RLS restricts to documents in the user's tenant.
4. Return 404 if no row found (either doesn't exist or user has no access).
5. Return 200.

#### Response -- 200 OK

```ts
type GetDocumentResponse = {
  document: Document;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Document not found or not accessible |
| 500 | `DB_ERROR` | Postgres query failed |

---

### POST /api/documents/bulk

Upload multiple PDF documents in a single request.

#### Request

`Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `files` | File[] (PDF) | Yes | One or more PDF files. Each must be `application/pdf`, max 20 MB. |
| `names` | string (JSON array) | No | JSON array of display names, one per file. If omitted or shorter than files, the original filename is used. |

The `names` field should be a JSON-encoded string array: `["Contract v1", "Amendment A", "Invoice 42"]`.

If `names` is not provided, the `file.name` from each `File` object in the browser is used (with extension stripped). If `names` is provided but has fewer entries than `files`, remaining files use their original filenames.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. **Role check:** `requireTenantRole(user.id, ['owner', 'admin', 'editor'])`. Return 403 if not.
3. Validate at least one file is provided. Max 10 files per bulk request. Return 400 if exceeded.
5. For each file, **sequential processing**:
   a. Validate file type and size.
   b. `computeBinaryHash(buffer)`.
   c. `extractPdfText(buffer)`.
   d. `computeTextHash(extractedText)`.
   e. Upload to Storage.
   f. INSERT into `documents`.
   g. Collect result: `{ status: 'ok', document }` or `{ status: 'error', error, code, name }`.
6. Errors on individual files do NOT stop processing. Other files continue.
7. Return 200 with the bulk result (even if some files failed -- check `succeeded` and `failed` counts).

#### Maximums

| Limit | Value |
|---|---|
| Max files per request | 10 |
| Max total request size | 100 MB (application layer check) |
| Max per-file size | 20 MB |

#### Response -- 200 OK

```ts
type BulkUploadResponse = BulkUploadResult;
```

Example:
```json
{
  "tenant_id": "550e8400-...",
  "results": [
    {
      "status": "ok",
      "document": { "id": "aaa...", "name": "Contract v1", ... },
      "name": "Contract v1"
    },
    {
      "status": "error",
      "error": "File is not a valid PDF",
      "code": "INVALID_FILE_TYPE",
      "name": "notes.txt"
    },
    {
      "status": "ok",
      "document": { "id": "bbb...", "name": "Amendment A", ... },
      "name": "Amendment A"
    }
  ],
  "succeeded": 2,
  "failed": 1
}
```

#### Errors (whole-request failures -- per-file failures are inside `results`)

| Status | `code` | Condition |
|---|---|---|
| 400 | `NO_FILES` | No files provided in the request |
| 400 | `TOO_MANY_FILES` | More than 10 files in the request |
| 400 | `INVALID_NAMES` | `names` field is not valid JSON or not an array |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not have editor/admin/owner role |
| 500 | `DB_ERROR` | Postgres operation failed |

Per-file error codes (inside `results[]`): `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `STORAGE_ERROR`, `DB_ERROR`.

---

### POST /api/compare

Compare two documents. Requires auth. Both documents must belong to the same tenant and the user must have access.

#### Request

`Content-Type: application/json`

```ts
type CompareRequest = {
  docAId: string;  // UUID of first document
  docBId: string;  // UUID of second document
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate both UUIDs. Return 400 `SAME_DOCUMENT` if equal.
3. Fetch both document records. RLS ensures user has access to both.
4. Return 404 if either is not found (includes "not accessible" cases).
5. **Same-tenant check (app layer):** Verify `docA.tenant_id === docB.tenant_id`. Return 400 `CROSS_TENANT_COMPARE` if they differ.
6. Run the three-step pipeline (identical to P1):
   - **Step 1:** Binary hash check.
   - **Step 2:** Text hash check.
   - **Step 3:** AI compare (only if text hashes differ).
7. Return 200 with the result.

#### DeepSeek API Call (Step 3) -- Unchanged from P1

The prompt construction, API call, and response parsing are identical to P1. See the P1 specification for full details. Summary:

- Endpoint: `POST https://api.deepseek.com/chat/completions`
- Model: `deepseek-chat`
- Response format: `json_object`
- Text truncation at 40,000 characters per document.
- Zod schema validation on AI response (`AIVerdictSchema`).

#### Response -- 200 OK

```ts
type CompareResponse = CompareResult;
```

Example (unchanged from P1):
```json
{
  "docAId": "550e8400-...",
  "docBId": "3f2504e0-...",
  "stage": "AI_COMPARE",
  "verdict": "MATERIAL",
  "confidence": "HIGH",
  "reasoning": "The payment amount in clause 3.1 was changed..."
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_DOC_A_ID` | `docAId` not a valid UUID |
| 400 | `INVALID_DOC_B_ID` | `docBId` not a valid UUID |
| 400 | `SAME_DOCUMENT` | `docAId` and `docBId` are identical |
| 400 | `CROSS_TENANT_COMPARE` | Documents belong to different tenants |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `DOC_A_NOT_FOUND` | Document A not found or not accessible |
| 404 | `DOC_B_NOT_FOUND` | Document B not found or not accessible |
| 500 | `DB_ERROR` | Postgres query failed |
| 500 | `AI_API_ERROR` | DeepSeek API call failed |
| 500 | `AI_PARSE_ERROR` | DeepSeek response did not match expected schema |

---

## Auth Endpoints (Supabase-Managed)

P2 does **NOT** create custom auth API routes. Authentication (sign-up, sign-in, sign-out, password reset) is handled entirely by the Supabase browser client calling `supabase.auth.*` methods directly from the frontend. The API routes above consume the resulting session cookie.

**Frontend must implement:**

- **Sign-up flow:** Call `supabase.auth.signUp({ email, password })`. On success, call `POST /api/profile` (not needed -- profile is created automatically via database trigger or the sign-up callback in `lib/auth.ts` using the service-role client).
- **Sign-in flow:** Call `supabase.auth.signInWithPassword({ email, password })`.
- **Sign-out flow:** Call `supabase.auth.signOut()`.
- **Session listener:** Subscribe to `supabase.auth.onAuthStateChange()` in the browser to react to login/logout events and redirect accordingly.

**Profile creation on sign-up:** The backend provides a mechanism (either a database trigger on `auth.users` or application logic via the service-role client) that auto-creates a `profiles` row and a `tenants` row when a new user signs up. The exact implementation (trigger vs. app logic) is a backend agent decision. The architect recommends a **database trigger** for reliability:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name) VALUES (NEW.email) RETURNING id INTO new_tenant_id;
  INSERT INTO public.profiles (id, tenant_id, display_name)
  VALUES (NEW.id, new_tenant_id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

This trigger is included in the P2 migration (`20260621000001_p2_auth_rbac.sql`) as part of the database contract.

---

## File Storage in Supabase Storage (Updated for P2)

- Files are uploaded using the **user-scoped** client (user's JWT, not the service-role key).
- The bucket name is `pdf-uploads` (private).
- The path format is `uploads/{UTC_year}/{tenant_id}/{uuid}.pdf`.
- Storage access remains server-side only. No signed URLs or public access.
- The route handler enforces tenant membership before upload (as a gate before the RLS check).

---

## Environment Variables Used by Route Handlers

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client initialisation (server + client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client initialisation (server + client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin client (profile creation on sign-up, trigger) |
| `DEEPSEEK_API_KEY` | Authorization header for DeepSeek API calls |

No new environment variables are required for P2. The existing variables cover all auth and data access patterns. The `SUPABASE_SERVICE_ROLE_KEY` is now restricted to admin operations only (trigger + any future admin route handlers).

---

## P1 Baseline (Preserved)

All P1 endpoint shapes and the core compare pipeline are preserved. The P1 endpoints that changed behaviour:

- `POST /api/documents` -- adds auth and tenant-level role check.
- `GET /api/documents` -- adds auth (RLS enforces access via tenant scoping).
- `GET /api/documents/[id]` -- adds auth (RLS enforces access).
- `POST /api/compare` -- adds auth and same-tenant validation.

All other P1 error codes, the CompareResult shape, and the AI prompt contract remain identical.

---

## P5 Endpoint Index

| Method | Path | Auth | Role Required | Description |
|---|---|---|---|---|
| `POST` | `/api/anchor` | Yes | editor/admin | Anchor a document's fingerprint on-chain |
| `POST` | `/api/verify` | Yes | member | Verify a document's on-chain anchoring status |

---

## P5 Shared Types

```ts
// ===== Blockchain Anchoring (P5) =====

type AnchorRequest = {
  documentId: string;  // UUID of the document to anchor
};

type AnchorResponse = {
  documentId: string;
  fingerprint: string;    // 0x-prefixed keccak256 hash (66 chars)
  chain: string;          // chain identifier (e.g., "anvil", "sepolia")
  txHash: string;         // 0x-prefixed transaction hash (66 chars)
  anchoredAt: number;     // unix timestamp (seconds) from the block
  verified: boolean;      // always true on successful anchor
};

type VerifyRequest = {
  documentId: string;  // UUID of the document to verify
};

type VerifyResponse = {
  documentId: string;
  intact: boolean;
  reason: 'ok' | 'not_anchored' | 'hash_mismatch' | 'not_on_chain';
  storedFingerprint: string | null;      // what is in the database (null if never anchored)
  recomputedFingerprint: string;          // recomputed from current DB hashes
  anchoredAt: number | null;             // unix timestamp from chain (null if not found)
  txHash: string | null;                 // stored transaction hash
  chain: string | null;                  // stored chain name
};
```

### P5 Reason Codes

| `reason` | Meaning |
|---|---|
| `ok` | Document is intact -- recomputed fingerprint matches stored fingerprint AND on-chain confirms |
| `not_anchored` | Document has never been anchored (`fingerprint` column is NULL) |
| `hash_mismatch` | Recomputed fingerprint does not match stored fingerprint -- the document hashes have changed since anchoring |
| `not_on_chain` | Recomputed fingerprint matches stored fingerprint, but the on-chain contract returns 0 (not found) -- possible chain reset or wrong contract address |

### Updated Document Type (P5 fields)

The `Document` type defined in the P2 Shared Types section gains four nullable fields:

```ts
type Document = {
  // ... all existing P1-P4 fields ...
  fingerprint: string | null;    // P5: 0x-prefixed keccak256 hash (66 chars), null if not anchored
  chain: string | null;          // P5: chain identifier, null if not anchored
  tx_hash: string | null;        // P5: transaction hash, null if not anchored
  anchored_at: string | null;    // P5: ISO 8601 timestamptz, null if not anchored
};
```

---

## P5 Endpoints

---

### POST /api/anchor

Anchor a document's fingerprint on the configured blockchain. The document's `binary_hash` and `text_hash` are read from the database and used to compute a keccak256 fingerprint, which is then written to the `inTrustVaultAnchor` smart contract. The resulting transaction hash, chain identifier, and block timestamp are stored back in the `documents` table.

This endpoint **requires a funded signer account** on the target chain. The `ANCHOR_PRIVATE_KEY` env var must reference an account with sufficient native balance for gas.

#### Request

`Content-Type: application/json`

```ts
type AnchorRequest = {
  documentId: string;  // UUID of the document (must exist, must not be soft-deleted)
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `documentId` is a valid UUID. Return 400 `INVALID_DOCUMENT_ID` if not.
3. Fetch the document from `documents` where `id = documentId`. RLS ensures the user has access.
4. Return 404 `NOT_FOUND` if the document does not exist or the user cannot access it.
5. Return 410 `DOCUMENT_DELETED` if `deleted_at IS NOT NULL` (soft-deleted documents cannot be anchored).
6. Return 409 `ALREADY_ANCHORED` if `document.fingerprint IS NOT NULL`. A document can only be anchored once.
7. **Role check:** `requireTenantRole(user.id, ['owner', 'admin', 'editor'])`. Return 403 `FORBIDDEN` if insufficient.
8. Call `computeFingerprint(document.binary_hash, document.text_hash)` from `lib/anchor.ts` to produce the fingerprint.
9. Call `getAnchorService()` to obtain the configured `AnchorService` instance.
10. Call `anchorService.anchor(fingerprint)` to send the on-chain transaction.
    - The service dry-runs first (simulateContract) to catch "Already anchored" reverts early.
    - Then sends the transaction and waits for confirmation.
    - Returns `{ txHash, anchoredAt }`.
11. UPDATE the `documents` row with user-scoped Supabase client:
    - SET `fingerprint = fingerprint`, `chain = chainName`, `tx_hash = txHash`, `anchored_at = to_timestamp(anchoredAt)`.
    - RLS policy `documents_update_anchor` must allow this UPDATE.
12. Return 201 with the `AnchorResponse`.

**The `chain` value stored in the database:** Determined at anchor time from the configured chain. For `ANCHOR_CHAIN_ID=31337`, store `"anvil"`. For `11155111`, store `"sepolia"`. A mapping from chain ID to human-readable name is maintained in `lib/anchor.ts`:

```ts
const CHAIN_ID_TO_NAME: Record<number, string> = {
  31337: "anvil",
  11155111: "sepolia",
  8453: "base",
  10: "optimism",
  1: "mainnet",
};
```

If the chain ID is not in this map, store the numeric chain ID as a string (e.g., `"84532"`).

#### Response -- 201 Created

```ts
type AnchorResponse = {
  documentId: string;
  fingerprint: string;    // 0x-prefixed hex, 66 chars
  chain: string;
  txHash: string;         // 0x-prefixed hex, 66 chars
  anchoredAt: number;     // unix timestamp (seconds)
  verified: boolean;      // true
};
```

Example:
```json
{
  "documentId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "fingerprint": "0x8f14e45f6e1234567890abcdef1234567890abcdef1234567890abcdef123456",
  "chain": "anvil",
  "txHash": "0x9e5c7b64a1234567890abcdef1234567890abcdef1234567890abcdef123456",
  "anchoredAt": 1719000000,
  "verified": true
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_DOCUMENT_ID` | `documentId` is not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not have editor/admin/owner role |
| 404 | `NOT_FOUND` | Document does not exist or user cannot access it |
| 409 | `ALREADY_ANCHORED` | Document has already been anchored (`fingerprint IS NOT NULL`) |
| 410 | `DOCUMENT_DELETED` | Document has been soft-deleted (`deleted_at IS NOT NULL`) |
| 500 | `DB_ERROR` | Postgres query/update failed |
| 500 | `ANCHOR_ERROR` | Anchor transaction failed (RPC error, revert, timeout, or insufficient balance) |

---

### POST /api/verify

Verify a document's integrity by recomputing its fingerprint from the current database hashes and checking against the on-chain registry. This endpoint is **read-only** -- no transaction is sent.

#### Request

`Content-Type: application/json`

```ts
type VerifyRequest = {
  documentId: string;  // UUID of the document to verify
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `documentId` is a valid UUID. Return 400 `INVALID_DOCUMENT_ID` if not.
3. Fetch the document from `documents` where `id = documentId`. RLS ensures the user has access.
4. Return 404 `NOT_FOUND` if the document does not exist or user cannot access it.
5. Call `computeFingerprint(document.binary_hash, document.text_hash)` to produce the **recomputed fingerprint** from the current hashes in the database.
6. **Case 1: `document.fingerprint IS NULL`** -- The document was never anchored.
   - Return 200 with `{ intact: false, reason: "not_anchored", storedFingerprint: null, recomputedFingerprint, anchoredAt: null, txHash: null, chain: null }`.
7. **Case 2: `recomputedFingerprint !== document.fingerprint`** -- The hashes in the database have changed since the document was anchored. This indicates tampering (the stored file or extracted text was modified after anchoring).
   - Return 200 with `{ intact: false, reason: "hash_mismatch", storedFingerprint: document.fingerprint, recomputedFingerprint, anchoredAt: null, txHash: document.tx_hash, chain: document.chain }`.
8. **Case 3: `recomputedFingerprint === document.fingerprint`** -- The hashes match. Now verify on-chain.
   - Call `anchorService.verify(recomputedFingerprint)` to check the on-chain registry.
   - **Sub-case 3a: `found === true`** -- Return 200 with `{ intact: true, reason: "ok", storedFingerprint: document.fingerprint, recomputedFingerprint, anchoredAt, txHash: document.tx_hash, chain: document.chain }`.
   - **Sub-case 3b: `found === false`** -- The fingerprint is in our database but not on the chain. Possible causes: the transaction was never actually confirmed (despite our record), the chain was reset, or the `ANCHOR_CONTRACT_ADDRESS` was changed.
   - Return 200 with `{ intact: false, reason: "not_on_chain", storedFingerprint: document.fingerprint, recomputedFingerprint, anchoredAt: null, txHash: document.tx_hash, chain: document.chain }`.

#### Response -- 200 OK

```ts
type VerifyResponse = {
  documentId: string;
  intact: boolean;
  reason: 'ok' | 'not_anchored' | 'hash_mismatch' | 'not_on_chain';
  storedFingerprint: string | null;
  recomputedFingerprint: string;
  anchoredAt: number | null;    // unix timestamp from chain
  txHash: string | null;
  chain: string | null;
};
```

Example (intact):
```json
{
  "documentId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "intact": true,
  "reason": "ok",
  "storedFingerprint": "0x8f14e45f6e1234567890abcdef1234567890abcdef1234567890abcdef123456",
  "recomputedFingerprint": "0x8f14e45f6e1234567890abcdef1234567890abcdef1234567890abcdef123456",
  "anchoredAt": 1719000000,
  "txHash": "0x9e5c7b64a1234567890abcdef1234567890abcdef1234567890abcdef123456",
  "chain": "anvil"
}
```

Example (hash mismatch -- tampering detected):
```json
{
  "documentId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "intact": false,
  "reason": "hash_mismatch",
  "storedFingerprint": "0x8f14e45f6e1234567890abcdef1234567890abcdef1234567890abcdef123456",
  "recomputedFingerprint": "0x9a2b3c4d5e6789012345abcdef6789012345abcdef6789012345abcdef67890",
  "anchoredAt": null,
  "txHash": "0x9e5c7b64a1234567890abcdef1234567890abcdef1234567890abcdef123456",
  "chain": "anvil"
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_DOCUMENT_ID` | `documentId` is not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Document does not exist or user cannot access it |
| 500 | `DB_ERROR` | Postgres query failed |
| 500 | `ANCHOR_RPC_ERROR` | Anchor RPC is unreachable (verify call failed) |

**Note:** Verify never returns 403 for viewers. All tenant members (including viewers) can verify document integrity. Verification is a read-only operation that poses no risk.

---

## P5 Environment Variables (Used by Route Handlers)

| Variable | Used by |
|---|---|
| `ANCHOR_RPC_URL` | `getAnchorService()` -- connects to the EVM RPC endpoint |
| `ANCHOR_CHAIN_ID` | `getAnchorService()` -- identifies the chain for viem client config |
| `ANCHOR_CONTRACT_ADDRESS` | `getAnchorService()` -- address of the deployed `inTrustVaultAnchor` |
| `ANCHOR_PRIVATE_KEY` | `createSigner()` -- signs anchor transactions. **Server-only, never prefixed with `NEXT_PUBLIC_`** |

These are in addition to the P2 environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`).

---

## P6 Endpoint Index — AI Vault Assistant

| Method | Path | Auth | Role Required | Description |
|---|---|---|---|---|
| `POST` | `/api/assistant/ingest` | Yes | editor/admin | Ingest document(s) into vector store |
| `POST` | `/api/assistant/chat` | Yes | member | Send a chat message (streaming SSE response) |
| `GET` | `/api/assistant/sessions` | Yes | viewer+ | List chat sessions for the user's tenant |
| `GET` | `/api/assistant/sessions/[id]` | Yes | viewer+ | Get chat session with messages |
| `DELETE` | `/api/assistant/sessions/[id]` | Yes | viewer+ | Delete a chat session (own session only) |
| `GET` | `/api/assistant/sessions/[id]/messages` | Yes | viewer+ | Get messages for a session |

---

## P6 Shared Types

```ts
// ===== Document Chunk =====

type DocumentChunk = {
  id: string;            // UUID
  document_id: string;   // UUID of source document
  tenant_id: string;     // UUID of tenant
  chunk_index: number;   // 0-based position in document
  content: string;       // chunk text
  token_count: number;   // approximate token count
  created_at: string;    // ISO 8601 UTC
};

// ===== Chat Session =====

type ChatSession = {
  id: string;            // UUID
  tenant_id: string;     // UUID
  user_id: string;       // UUID of auth.users
  title: string;         // display title
  created_at: string;    // ISO 8601 UTC
  updated_at: string;    // ISO 8601 UTC
};

// ===== Chat Message =====

type Citation = {
  document_id: string;     // UUID
  document_name: string;   // display name
  chunk_index: number;     // chunk index
  snippet: string;         // ~150 char excerpt
};

type ChatMessage = {
  id: string;              // UUID
  session_id: string;      // UUID
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[] | null;  // only for assistant messages
  created_at: string;      // ISO 8601 UTC
};

// ===== Ingest =====

type IngestRequest = {
  documentIds: string[];   // UUIDs of documents to ingest
};

type IngestResponse = {
  ingested: number;        // number of documents successfully processed
  failed: number;          // number that failed
  totalChunks: number;     // total chunks created
  errors: string[];        // per-document error messages
};

// ===== Chat (SSE) =====

type ChatRequest = {
  sessionId?: string;      // existing session UUID, or omit to create new
  tenantId: string;        // tenant context for RAG
  message: string;         // user's question
};

// SSE event types:
// - "token": { token: string } — streaming token from LLM
// - "citations": { citations: Citation[] } — source citations
// - "done": { sessionId: string, messageId: string } — completion
// - "error": { error: string, code: string } — error
```

---

## P6 Endpoints

---

### POST /api/assistant/ingest

Ingest one or more documents into the vector store. This chunks the document text, generates embeddings via OpenAI, and stores the chunks in `document_chunks`. Documents that already have chunks are skipped (idempotent).

#### Request

`Content-Type: application/json`

```ts
type IngestRequest = {
  documentIds: string[];  // 1-50 document UUIDs
};
```

#### Processing

1. `requireAuth()` — return 401 if no session.
2. Validate `documentIds` is a non-empty array, max 50 entries. Each must be a valid UUID.
3. For each document ID:
   a. Fetch the document from `documents`. RLS ensures user has access.
   b. Return per-document error if not found/accessible.
   c. Check if chunks already exist for this document. If yes, skip (idempotent).
   d. **Role check:** `requireTenantRole(user.id, ['owner', 'admin', 'editor'])`. Return 403 if insufficient.
   e. Call `chunkDocument(document)` to split `extracted_text` into overlapping chunks.
   f. For each chunk, call `generateEmbedding(chunk)` via OpenAI API.
   g. Insert chunks into `document_chunks` (user-scoped client, RLS-enforced).
4. Return 200 with `IngestResponse`.

#### Response -- 200 OK

```ts
type IngestResponse = {
  ingested: number;
  failed: number;
  totalChunks: number;
  errors: string[];
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_DOCUMENT_IDS` | `documentIds` missing, empty, or > 50 |
| 400 | `INVALID_DOCUMENT_ID` | An entry in `documentIds` is not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 500 | `EMBEDDING_ERROR` | OpenAI embedding API call failed |
| 500 | `DB_ERROR` | Postgres insert failed |

Per-document errors (in `errors[]`): `NOT_FOUND`, `FORBIDDEN`, `EMBEDDING_ERROR`, `EMPTY_TEXT` (document has no extracted text).

---

### POST /api/assistant/chat

Send a chat message and receive a streaming SSE response. This is the core RAG endpoint: embed the question → retrieve similar chunks → build prompt with context → stream LLM response.

#### Request

`Content-Type: application/json`

```ts
type ChatRequest = {
  sessionId?: string;    // existing session UUID; omit to create a new session
  tenantId: string;      // tenant context for RAG (required)
  message: string;       // user's question (1-4000 characters)
};
```

#### Processing

1. `requireAuth()` — return 401 if no session.
2. Validate `tenantId` is a valid UUID. Validate `message` is non-empty, <= 4000 chars.
3. Verify user belongs to the tenant. Return 403 if not.
4. **Session resolution:**
   - If `sessionId` provided: fetch session, verify it belongs to the user. Return 404 if not found.
   - If no `sessionId`: create a new `chat_sessions` row with `title = message.slice(0, 100)`.
5. Insert the user message into `chat_messages`.
6. **RAG pipeline:**
   a. Generate embedding for the user's message via OpenAI.
   b. Query `document_chunks` where `tenant_id = tenantId`, ordered by `embedding <=> queryEmbedding` (cosine distance), LIMIT 5.
   c. If no chunks found (tenant has no ingested documents): return a plain chat response (no context).
7. **Build RAG prompt:**
   - System: "You are inTrustVault AI Assistant. Answer questions based on the provided document excerpts. Cite sources when possible. If the answer cannot be found in the excerpts, say so honestly."
   - User prompt: context chunks + conversation history (last 10 messages) + current question.
8. **Stream response via SSE:**
   - Call DeepSeek `chat/completions` with `stream: true`.
   - Emit `token` events as tokens arrive.
   - After stream completes, extract citations from the full response.
   - Emit `citations` event.
   - Save the assistant message to `chat_messages` with citations.
   - Update `chat_sessions.updated_at` and `title` (from first user message if new).
   - Emit `done` event with `sessionId` and `messageId`.
9. On error, emit `error` event and close the stream.

#### Response -- 200 OK (SSE stream)

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: token
data: {"token":"Based"}

event: token
data: {"token":" on"}

event: token
data: {"token":" the"}

...

event: citations
data: {"citations":[{"document_id":"...","document_name":"contract.pdf","chunk_index":2,"snippet":"Payment terms: ..."}]}

event: done
data: {"sessionId":"...","messageId":"..."}
```

#### Errors (non-streaming — returned as JSON before SSE starts)

| Status | `code` | Condition |
|---|---|---|
| 400 | `MISSING_TENANT_ID` | `tenantId` missing or not a valid UUID |
| 400 | `MISSING_MESSAGE` | `message` missing or empty |
| 400 | `MESSAGE_TOO_LONG` | `message` > 4000 characters |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not belong to the tenant |
| 404 | `SESSION_NOT_FOUND` | `sessionId` provided but not found or not owned by user |
| 500 | `EMBEDDING_ERROR` | OpenAI embedding API call failed |
| 500 | `AI_API_ERROR` | DeepSeek API call failed |
| 500 | `DB_ERROR` | Postgres query/insert failed |

---

### GET /api/assistant/sessions

List chat sessions for the current user's tenant. Returns sessions ordered by `updated_at` descending (most recent first). Only returns sessions owned by the current user.

#### Request

`Content-Type: none` (GET)

#### Processing

1. `requireAuth()` — return 401 if no session.
2. Get user's `tenant_id` from `profiles`.
3. Query `chat_sessions` where `tenant_id = :tenantId AND user_id = :userId`, ordered by `updated_at DESC`.
4. Return the list.

#### Response -- 200 OK

```ts
type ListSessionsResponse = {
  sessions: ChatSession[];
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | No valid session |
| 500 | `DB_ERROR` | Postgres query failed |

---

### GET /api/assistant/sessions/[id]

Get a single chat session with its messages.

#### Request

`Content-Type: none` (GET with path parameter)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The session UUID |

#### Processing

1. `requireAuth()` — return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch session. RLS ensures user can only see their own sessions.
4. Return 404 if not found.
5. Fetch messages for the session, ordered by `created_at ASC`.
6. Return session + messages.

#### Response -- 200 OK

```ts
type GetSessionResponse = {
  session: ChatSession;
  messages: ChatMessage[];
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Session not found or not owned by user |
| 500 | `DB_ERROR` | Postgres query failed |

---

### DELETE /api/assistant/sessions/[id]

Delete a chat session and all its messages (CASCADE).

#### Processing

1. `requireAuth()` — return 401 if no session.
2. Validate `id` is a valid UUID.
3. Delete session. RLS ensures user can only delete their own sessions.
4. Return 200.

#### Response -- 200 OK

```json
{ "deleted": true }
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Session not found or not owned by user |
| 500 | `DB_ERROR` | Postgres delete failed |

---

## P6 Environment Variables

| Variable | Used by |
|---|---|
| `OPENAI_API_KEY` | OpenAI `text-embedding-3-small` (1536 dims) for chunk + query embeddings |
| `DEEPSEEK_API_KEY` | (existing) DeepSeek `deepseek-chat` for AI chat + compare |

Both are required for P6.

---

## P14 Endpoint Index -- Tenant-Level RBAC + Invitations

| Method | Path | Auth | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/api/tenant/members` | Yes | admin/owner | List all members of the current user's tenant |
| `PATCH` | `/api/tenant/members/[userId]` | Yes | admin/owner | Update a member's role |
| `DELETE` | `/api/tenant/members/[userId]` | Yes | admin/owner | Remove a member from the tenant |
| `POST` | `/api/tenant/invite` | Yes | admin/owner | Send an invitation to join the tenant |
| `GET` | `/api/tenant/join` | Yes | -- | Accept an invitation (any authenticated user) |

---

## P14 Shared Types

```ts
// ===== RBAC =====

type TenantRole = 'owner' | 'admin' | 'editor' | 'viewer';

// Updated Profile type (P14 adds role)
type Profile = {
  id: string;              // UUID, equals auth.users.id
  tenant_id: string;       // UUID
  display_name: string | null;
  role: TenantRole;        // P14: tenant-level role
  created_at: string;      // ISO 8601 UTC
};

// ===== Tenant Members =====

type TenantMember = {
  id: string;              // UUID (auth.users.id)
  email: string;           // from auth.users
  display_name: string | null;
  role: TenantRole;
  created_at: string;      // ISO 8601 UTC
};

// ===== Invitations =====

type Invitation = {
  id: string;              // UUID
  tenant_id: string;       // UUID
  email: string;
  role: 'admin' | 'editor' | 'viewer';  // owner not allowed
  created_by: string;      // UUID of auth.users who sent the invite
  created_at: string;      // ISO 8601 UTC
  expires_at: string;      // ISO 8601 UTC (7 days after created_at)
  accepted_at: string | null;  // ISO 8601 UTC, null if pending
};

type InviteRequest = {
  email: string;           // email address of invitee
  role: 'admin' | 'editor' | 'viewer';  // cannot be owner
};

type InviteResponse = {
  invitation: Invitation;
  // Note: token is NOT returned in the response body.
  // The token is delivered to the invitee via email only.
};

type UpdateMemberRoleRequest = {
  role: 'admin' | 'editor' | 'viewer';  // cannot set to owner
};

type UpdateMemberRoleResponse = {
  member: TenantMember;
};

type RemoveMemberResponse = {
  removed: true;
};

type ListMembersResponse = {
  members: TenantMember[];
  total: number;
};

type JoinResponse = {
  tenant_id: string;       // UUID of the tenant the user joined
  role: string;            // the role assigned ('admin', 'editor', or 'viewer')
};
```

---

## P14 Endpoints

---

### GET /api/tenant/members

List all members of the authenticated user's tenant. User must be an admin or owner.

#### Request

`Content-Type: none` (GET with optional query params)

| Query param | Type | Required | Description |
|---|---|---|---|
| `search` | string | No | Case-insensitive substring match against member's display_name or email. |
| `limit` | number | No | Max results. Default: 50. Max: 200. |
| `offset` | number | No | Rows to skip. Default: 0. |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get user's profile (tenant_id + role).
3. `requireTenantRole(user.id, user.profile.tenant_id, ['owner', 'admin'])` -- return 403 if viewer/editor.
4. Query `profiles` joined with `auth.users` (for email) where `tenant_id = :tenantId`.
5. Apply `search` filter on `display_name` or `email` if provided (ILIKE).
6. Order by `created_at ASC`.
7. Apply `LIMIT` and `OFFSET`.
8. Return member list. The calling user is included in the results.

#### Response -- 200 OK

```ts
type ListMembersResponse = {
  members: TenantMember[];
  total: number;
};
```

Example:
```json
{
  "members": [
    {
      "id": "550e8400-...",
      "email": "alice@example.com",
      "display_name": "Alice",
      "role": "owner",
      "created_at": "2026-06-21T10:00:00.000Z"
    },
    {
      "id": "3f2504e0-...",
      "email": "bob@example.com",
      "display_name": "Bob",
      "role": "editor",
      "created_at": "2026-07-01T14:30:00.000Z"
    }
  ],
  "total": 2
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is not an admin or owner |
| 400 | `INVALID_LIMIT` | `limit` not a positive integer or exceeds 200 |
| 400 | `INVALID_OFFSET` | `offset` not a non-negative integer |
| 500 | `DB_ERROR` | Postgres query failed |

---

### PATCH /api/tenant/members/[userId]

Update a member's role. User must be an admin or owner. Cannot change the owner's role. Cannot promote anyone to owner. An admin cannot change another admin's role (only the owner can). An admin demoting themselves is blocked if they are the last admin.

#### Request

`Content-Type: application/json`

```ts
type UpdateMemberRoleRequest = {
  role: 'admin' | 'editor' | 'viewer';
};
```

#### Path Parameters

| Path param | Type | Required | Description |
|---|---|---|---|
| `userId` | string (UUID) | Yes | The auth.users.id of the member to update |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get calling user's profile.
3. `requireTenantRole(caller.id, tenantId, ['owner', 'admin'])` -- return 403 if not.
4. Validate `userId` is a valid UUID.
5. Validate `role` is one of `'admin'`, `'editor'`, `'viewer'`. Return 400 `INVALID_ROLE` if not (owner cannot be set via this endpoint).
6. Fetch the target member's profile. Return 404 if not found or not in the same tenant.
7. **Owner protection:** If target's `role` is `'owner'`, return 403 `CANNOT_MODIFY_OWNER`.
8. **Admin-to-admin restriction:** If caller's `role` is `'admin'` and target's current `role` is `'admin'`, return 403 `ADMINS_CANNOT_MODIFY_ADMINS`. Only the owner can change admin roles.
9. **Self-demotion check:** If `userId === caller.id` and the caller is demoting themselves from admin, count remaining admins/owners. If this is the last one, return 400 `LAST_ADMIN`.
10. Update `profiles.role` for the target user. Use user-scoped client (RLS: caller must be admin/owner; application-layer check already verified).
11. Return 200 with the updated member.

#### Response -- 200 OK

```ts
type UpdateMemberRoleResponse = {
  member: TenantMember;
};
```

Example:
```json
{
  "member": {
    "id": "3f2504e0-...",
    "email": "bob@example.com",
    "display_name": "Bob",
    "role": "admin",
    "created_at": "2026-07-01T14:30:00.000Z"
  }
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_USER_ID` | `userId` is not a valid UUID |
| 400 | `INVALID_ROLE` | `role` is not `admin`, `editor`, or `viewer` |
| 400 | `LAST_ADMIN` | Caller is demoting themselves and is the last admin/owner |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Caller is not an admin or owner |
| 403 | `CANNOT_MODIFY_OWNER` | Target is the owner |
| 403 | `ADMINS_CANNOT_MODIFY_ADMINS` | Caller is admin trying to change another admin |
| 404 | `NOT_FOUND` | Target user not found or not in the same tenant |
| 500 | `DB_ERROR` | Postgres update failed |

---

### DELETE /api/tenant/members/[userId]

Remove a member from the tenant. User must be an admin or owner. The owner cannot be removed. An admin removing themselves is blocked if they are the last admin.

#### Request

`Content-Type: none` (DELETE, no body)

| Path param | Type | Required | Description |
|---|---|---|---|
| `userId` | string (UUID) | Yes | The auth.users.id of the member to remove |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get calling user's profile.
3. `requireTenantRole(caller.id, tenantId, ['owner', 'admin'])` -- return 403 if not.
4. Validate `userId` is a valid UUID.
5. Fetch the target member's profile. Return 404 if not found or not in the same tenant.
6. **Owner protection:** If target's `role` is `'owner'`, return 403 `CANNOT_REMOVE_OWNER`.
7. **Admin-to-admin restriction:** If caller's `role` is `'admin'` and target's current `role` is `'admin'`, return 403 `ADMINS_CANNOT_REMOVE_ADMINS`. Only the owner can remove admins.
8. **Self-removal check:** If `userId === caller.id`, count remaining admins/owners. If this is the last one, return 400 `LAST_ADMIN`.
9. Update the target user's profile: set `tenant_id = NULL` and `role = 'viewer'`. This removes them from the tenant but preserves their account. Use service-role client for this update (the user-scoped client with RLS may restrict the UPDATE, and the target user should not need to satisfy RLS to be removed).
10. Return 200.

#### Response -- 200 OK

```json
{
  "removed": true
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_USER_ID` | `userId` is not a valid UUID |
| 400 | `LAST_ADMIN` | Caller is removing themselves and is the last admin/owner |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Caller is not an admin or owner |
| 403 | `CANNOT_REMOVE_OWNER` | Target is the owner |
| 403 | `ADMINS_CANNOT_REMOVE_ADMINS` | Caller is admin trying to remove another admin |
| 404 | `NOT_FOUND` | Target user not found or not in the same tenant |
| 500 | `DB_ERROR` | Postgres update failed |

---

### POST /api/tenant/invite

Send an invitation to join the tenant. User must be an admin or owner. The invitee receives an email with a link containing the invitation token. If a pending invitation already exists for the same email in this tenant, it is revoked (deleted) before the new one is created.

#### Request

`Content-Type: application/json`

```ts
type InviteRequest = {
  email: string;   // email address of invitee, 1-255 chars, valid email format
  role: 'admin' | 'editor' | 'viewer';  // cannot be owner
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get calling user's profile.
3. `requireTenantRole(caller.id, tenantId, ['owner', 'admin'])` -- return 403 if not.
4. Validate `email` is non-empty, <= 255 chars, and roughly valid email format (contains `@`). Return 400 `INVALID_EMAIL` if not.
5. Validate `role` is one of `'admin'`, `'editor'`, `'viewer'`. Return 400 `INVALID_ROLE` if not.
6. **Admin cannot invite as admin:** If caller's `role` is `'admin'` and `role` is `'admin'`, return 403 `ADMINS_CANNOT_INVITE_ADMINS`. Only the owner can invite admins.
7. Check if the invitee email already belongs to an active member of the tenant. Query `profiles` joined with `auth.users` for `LOWER(email) = LOWER(:email)` and `tenant_id = :tenantId`. If found, return 409 `ALREADY_MEMBER`.
8. Check if a pending invitation already exists for this `(tenant_id, LOWER(email))`. If yes, DELETE the old invitation (revoke it).
9. Generate token: `crypto.randomBytes(32).toString('hex')` -- 64-char hex string.
10. Compute `expires_at = now() + 7 days`.
11. INSERT into `invitations` with `tenant_id`, `email` (lowercased), `role`, `token`, `created_by = caller.id`, `expires_at`.
12. **Send email** to the invitee with the join link: `{APP_URL}/join?token={token}`. In dev mode, log the link to console instead.
13. Return 201 with the invitation (token is NOT included in the response -- it is delivered via email only).

#### Response -- 201 Created

```ts
type InviteResponse = {
  invitation: Invitation;
};
```

Example:
```json
{
  "invitation": {
    "id": "7a1b2c3d-...",
    "tenant_id": "123e4567-...",
    "email": "newuser@example.com",
    "role": "editor",
    "created_by": "550e8400-...",
    "created_at": "2026-07-03T10:00:00.000Z",
    "expires_at": "2026-07-10T10:00:00.000Z",
    "accepted_at": null
  }
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_EMAIL` | `email` is empty, > 255 chars, or not a valid email format |
| 400 | `INVALID_ROLE` | `role` is not `admin`, `editor`, or `viewer` |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Caller is not an admin or owner |
| 403 | `ADMINS_CANNOT_INVITE_ADMINS` | Caller is admin trying to invite as admin |
| 409 | `ALREADY_MEMBER` | The invitee email is already a member of the tenant |
| 500 | `DB_ERROR` | Postgres insert failed |
| 500 | `EMAIL_ERROR` | Email sending failed (the invitation row is still created; the admin can retry by re-inviting) |

---

### GET /api/tenant/join

Accept an invitation to join a tenant. Requires auth (any authenticated user) but no prior tenant membership. The authenticated user's email must match the invitation email.

#### Request

`Content-Type: none` (GET with query parameter)

| Query param | Type | Required | Description |
|---|---|---|---|
| `token` | string (64 hex chars) | Yes | The invitation token from the email link |

#### Processing

1. `requireAuth()` -- return 401 if no session. Note: the user may or may not already belong to a tenant -- both are acceptable at this stage.
2. Validate `token` is a non-empty 64-character hex string. Return 400 `INVALID_TOKEN` if not.
3. Look up the invitation by token. Return 404 `INVITATION_NOT_FOUND` if no row exists.
4. **Expiry check:** If `expires_at < now()`, return 410 `INVITATION_EXPIRED`.
5. **Already accepted check:** If `accepted_at IS NOT NULL`, return 409 `INVITATION_ALREADY_ACCEPTED`.
6. **Email match:** Get the authenticated user's email from `auth.users`. Compare `LOWER(auth_user.email)` to `LOWER(invitation.email)`. Return 403 `EMAIL_MISMATCH` if they do not match.
7. **Already in tenant check:** If the user's `profiles.tenant_id` is already set (to any tenant), return 409 `ALREADY_IN_TENANT`. A user can only belong to one tenant.
8. Update `profiles` for the accepting user (service-role client -- user-scoped RLS would block because the user has no tenant_id yet): SET `tenant_id = invitation.tenant_id`, `role = invitation.role`.
9. Update `invitations`: SET `accepted_at = now()` (service-role client -- same reason).
10. Return 200 with `{ tenant_id, role }`.

#### Response -- 200 OK

```ts
type JoinResponse = {
  tenant_id: string;
  role: string;
};
```

Example:
```json
{
  "tenant_id": "123e4567-...",
  "role": "editor"
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_TOKEN` | `token` is missing or not a 64-character hex string |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `EMAIL_MISMATCH` | Authenticated user's email does not match the invitation email |
| 404 | `INVITATION_NOT_FOUND` | No invitation exists with this token |
| 409 | `INVITATION_ALREADY_ACCEPTED` | Invitation has already been accepted |
| 409 | `ALREADY_IN_TENANT` | User already belongs to a tenant |
| 410 | `INVITATION_EXPIRED` | Invitation has expired (past `expires_at`) |
| 500 | `DB_ERROR` | Postgres update failed |

---

## P14 Role Requirement Overrides for Existing Endpoints

P14 replaces project-level RBAC with tenant-level RBAC. All existing endpoints that previously called `requireProjectRole()` must now call `requireTenantRole()`. The table below maps each existing write/mutate endpoint to its new P14 role requirement.

**Read-only endpoints that require any tenant membership (viewer+) are unchanged and not listed below.**

| Endpoint | Method | P14 Minimum Role | Notes |
|---|---|---|---|
| `/api/documents` | `POST` | `editor` | Upload single document |
| `/api/documents/bulk` | `POST` | `editor` | Bulk upload |
| `/api/documents/[id]` | `PATCH` | `editor` | Soft-delete/restore |
| `/api/anchor` | `POST` | `editor` | Anchor document on-chain |
| `/api/assistant/ingest` | `POST` | `editor` | Ingest documents for RAG |
| `/api/labels` | `POST` | `editor` | Create label |
| `/api/labels/[id]` | `PATCH` | `editor` | Update label |
| `/api/labels/[id]` | `DELETE` | `editor` | Delete label |
| `/api/documents/[id]/labels` | `POST` | `editor` | Attach label to document |
| `/api/documents/[id]/labels/[labelId]` | `DELETE` | `editor` | Detach label from document |

**Read-only endpoints (viewer+):** `GET /api/documents`, `GET /api/documents/[id]`, `POST /api/compare`, `POST /api/verify`, `POST /api/assistant/chat`, `GET /api/assistant/sessions`, `GET /api/assistant/sessions/[id]`, `DELETE /api/assistant/sessions/[id]` (user deletes own sessions only).

**Special cases:**
- `DELETE /api/assistant/sessions/[id]` -- the user can only delete their own sessions. RLS on `chat_sessions` enforces this via `user_id = auth.uid()`. No role check needed beyond viewer+.
- `POST /api/share/*`, `DELETE /api/share/*` -- share link management. RLS on `shared_links` enforces creator or admin/owner access (Section 13e of `database.md`). Application-layer check mirrors RLS.

---

## P16 Endpoint Index -- Custom AI Agents + Multi-Channel

| Method | Path | Auth | Role Required | Description |
|---|---|---|---|---|
| `POST` | `/api/agents` | Yes | editor/admin/owner | Create a new custom AI agent |
| `GET` | `/api/agents` | Yes | viewer+ | List all agents in the tenant |
| `GET` | `/api/agents/[id]` | Yes | viewer+ | Get agent details (with channels and documents) |
| `PATCH` | `/api/agents/[id]` | Yes | editor/admin/owner | Update agent (name, prompt, knowledge docs) |
| `DELETE` | `/api/agents/[id]` | Yes | editor/admin/owner | Delete agent (cascades to channels, sessions, messages) |
| `POST` | `/api/agents/[id]/channels` | Yes | editor/admin/owner | Add a messaging channel to the agent |
| `DELETE` | `/api/agents/[id]/channels/[channelId]` | Yes | editor/admin/owner | Remove a channel from the agent |
| `POST` | `/api/agents/[id]/chat` | Yes | viewer+ | Playground chat (SSE streaming, same pattern as assistant) |
| `GET` | `/api/agents/[id]/chat/sessions` | Yes | viewer+ | List playground sessions for this agent |
| `GET` | `/api/agents/[id]/chat/sessions/[sessionId]` | Yes | viewer+ | Get a session with messages |
| `DELETE` | `/api/agents/[id]/chat/sessions/[sessionId]` | Yes | viewer+ | Delete a session (own session only) |
| `POST` | `/api/agents/[id]/whatsapp/connect` | Yes | editor/admin/owner | Initialize WhatsApp Web connection and return QR code |
| `POST` | `/api/agents/[id]/whatsapp/disconnect` | Yes | editor/admin/owner | Disconnect WhatsApp and destroy the client session |
| `GET` | `/api/agents/[id]/whatsapp/status` | Yes | editor/admin/owner | Poll for WhatsApp connection status (qr_code / connecting / connected / disconnected) |
| `POST` | `/api/agents/[id]/telegram/connect` | Yes | editor/admin/owner | Connect Telegram bot via bot token |
| `POST` | `/api/agents/[id]/telegram/disconnect` | Yes | editor/admin/owner | Disconnect Telegram bot and remove webhook |
| `POST` | `/api/webhook/whatsapp/[agentId]` | No (internal) | -- | Receive incoming WhatsApp messages (reserved for future WhatsApp Business API) |
| `POST` | `/api/webhook/telegram/[agentId]` | No (webhook) | -- | Receive incoming Telegram messages from Telegram servers |

---

## P16 Shared Types

```ts
// ===== Agent =====

type Agent = {
  id: string;              // UUID
  tenant_id: string;       // UUID
  name: string;            // display name (1-255 chars)
  system_prompt: string;   // the persona-defining system prompt
  created_by: string;      // UUID of auth.users
  is_active: boolean;      // whether the agent is active
  created_at: string;      // ISO 8601 UTC
  updated_at: string;      // ISO 8601 UTC
};

type AgentWithDetails = Agent & {
  documents: Document[];           // knowledge-base documents
  channels: AgentChannel[];        // connected messaging channels
};

// ===== Agent Channel =====

type AgentChannel = {
  id: string;              // UUID
  agent_id: string;        // UUID
  channel_type: 'whatsapp' | 'telegram';
  config: Record<string, unknown>;  // channel-specific config (credentials REDACTED in response -- see processing)
  is_active: boolean;
  created_at: string;      // ISO 8601 UTC
};

// WhatsApp-specific config shape (returned with secrets redacted):
// { phone_number: string | null, bot_username?: string | null }

// Telegram-specific config shape (returned with secrets redacted):
// { bot_username: string | null }

// ===== Agent Session =====

type AgentSession = {
  id: string;              // UUID
  agent_id: string;        // UUID
  user_id: string;         // UUID of auth.users
  title: string;           // session display title
  created_at: string;      // ISO 8601 UTC
  updated_at: string;      // ISO 8601 UTC
};

// ===== Agent Message =====

type AgentMessage = {
  id: string;                  // UUID
  agent_id: string;            // UUID
  session_id: string;          // UUID
  role: 'user' | 'assistant';
  content: string;
  channel: string | null;      // null for playground, 'whatsapp', 'telegram'
  external_user_id: string | null;  // WhatsApp number or Telegram user ID
  citations: Citation[] | null;     // same shape as P6 Citation
  created_at: string;          // ISO 8601 UTC
};

// ===== Agent Create Request =====

type CreateAgentRequest = {
  name: string;                // 1-255 chars
  system_prompt: string;       // the persona prompt (1-10000 chars)
  document_ids: string[];      // UUIDs of documents for knowledge base (0-100)
};

// ===== Agent Update Request =====

type UpdateAgentRequest = {
  name?: string;               // 1-255 chars
  system_prompt?: string;      // 1-10000 chars
  document_ids?: string[];     // UUIDs of documents (replaces entire knowledge base)
  is_active?: boolean;         // toggle agent on/off
};

// ===== Add Channel Request =====

type AddChannelRequest = {
  channel_type: 'whatsapp' | 'telegram';
  config: Record<string, unknown>;
  // For whatsapp: { phone_number: string }
  // For telegram: { bot_token: string }
};

// ===== WhatsApp Connect Response =====

type WhatsAppConnectResponse = {
  channel_id: string;          // UUID of the created/updated agent_channel row
  status: 'qr_pending' | 'connecting' | 'connected';
  qr_code?: string;            // the QR code string to render (only when status = 'qr_pending')
  message: string;             // human-readable status message
};

// ===== WhatsApp Status Response =====

type WhatsAppStatusResponse = {
  channel_id: string;
  status: 'disconnected' | 'qr_pending' | 'connecting' | 'connected';
  qr_code?: string;            // present only when status = 'qr_pending'
  phone_number?: string;       // present when status = 'connected'
};

// ===== Telegram Connect Request =====

type TelegramConnectRequest = {
  bot_token: string;           // the Telegram Bot API token from @BotFather
};

// ===== Telegram Connect Response =====

type TelegramConnectResponse = {
  channel_id: string;
  bot_username: string;        // resolved from getMe() API call
  webhook_url: string;         // the registered webhook URL
};

// ===== Agent Chat Request =====

type AgentChatRequest = {
  session_id?: string;         // existing session UUID; omit to create a new session
  message: string;             // user's question (1-4000 characters)
};

// SSE event types (identical to P6 assistant chat):
// - "token": { token: string } — streaming token from LLM
// - "citations": { citations: Citation[] } — source citations (from agent's knowledge docs)
// - "done": { sessionId: string, messageId: string } — completion
// - "error": { error: string, code: string } — error
```

---

## P16 Endpoints

---

### POST /api/agents

Create a new custom AI agent. The agent is tenant-scoped and created by an editor, admin, or owner.

#### Request

`Content-Type: application/json`

```ts
type CreateAgentRequest = {
  name: string;                // 1-255 chars
  system_prompt: string;       // 1-10000 chars
  document_ids: string[];      // UUIDs of knowledge-base documents (0-100)
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get user's profile (tenant_id + role).
3. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
4. Validate `name`: non-empty, max 255 chars. Return 400 `INVALID_NAME` if not.
5. Validate `system_prompt`: non-empty, max 10000 chars. Return 400 `INVALID_SYSTEM_PROMPT` if not.
6. Validate `document_ids`: array of valid UUIDs, max 100 entries. Return 400 `INVALID_DOCUMENT_IDS` if not.
7. Verify each `document_id` belongs to the user's tenant (fetch from `documents` where `tenant_id = :tenantId`). Return 400 `DOCUMENT_NOT_IN_TENANT` if any document is not in the tenant.
8. INSERT into `agents` with `tenant_id` and `created_by = user.id`.
9. For each `document_id` in the request, INSERT into `agent_documents`.
10. Return 201 with the created agent.

#### Response -- 201 Created

```ts
type CreateAgentResponse = {
  agent: AgentWithDetails;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_NAME` | `name` missing, empty, or > 255 chars |
| 400 | `INVALID_SYSTEM_PROMPT` | `system_prompt` missing, empty, or > 10000 chars |
| 400 | `INVALID_DOCUMENT_IDS` | `document_ids` not a valid array, or > 100 entries |
| 400 | `DOCUMENT_NOT_IN_TENANT` | One or more document IDs do not belong to the user's tenant |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is a viewer |
| 500 | `DB_ERROR` | Postgres insert failed |

---

### GET /api/agents

List all agents in the authenticated user's tenant. Returns basic agent info without nested details.

#### Request

`Content-Type: none` (GET)

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get user's `tenant_id` from profiles.
3. Query `agents` where `tenant_id = :tenantId`, ordered by `created_at DESC`.
4. Return the list.

#### Response -- 200 OK

```ts
type ListAgentsResponse = {
  agents: Agent[];
  total: number;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | No valid session |
| 500 | `DB_ERROR` | Postgres query failed |

---

### GET /api/agents/[id]

Get full agent details including its knowledge-base documents and connected channels. Channel configs are returned with credentials redacted.

#### Request

`Content-Type: none` (GET with path parameter)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The agent UUID |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. RLS ensures user is in the same tenant.
4. Return 404 if not found.
5. Fetch linked documents via `agent_documents` JOIN `documents`.
6. Fetch connected channels via `agent_channels`. **Redact secrets in config:** for WhatsApp, only return `{ phone_number }`; for Telegram, only return `{ bot_username }`. Never return `bot_token`, `client_state`, or `qr_code` in the response.
7. Return 200.

#### Response -- 200 OK

```ts
type GetAgentResponse = {
  agent: AgentWithDetails;
};
```

`AgentWithDetails.channels[].config` contains only non-sensitive fields. WhatsApp returns `{ phone_number: string | null }`. Telegram returns `{ bot_username: string | null }`.

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Agent not found or not in user's tenant |
| 500 | `DB_ERROR` | Postgres query failed |

---

### PATCH /api/agents/[id]

Update an agent's name, system prompt, knowledge-base documents, or active status. All fields are optional -- only provided fields are updated.

#### Request

`Content-Type: application/json`

```ts
type UpdateAgentRequest = {
  name?: string;
  system_prompt?: string;
  document_ids?: string[];     // replaces the entire knowledge base
  is_active?: boolean;
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. RLS ensures user is in the same tenant. Return 404 if not found.
4. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
5. Validate fields if provided:
   - `name`: non-empty, max 255 chars.
   - `system_prompt`: non-empty, max 10000 chars.
   - `document_ids`: array of valid UUIDs, max 100. Each must belong to the tenant.
   - `is_active`: must be boolean.
6. If `name` provided, UPDATE `agents.name`.
7. If `system_prompt` provided, UPDATE `agents.system_prompt`.
8. If `is_active` provided, UPDATE `agents.is_active`.
9. If `document_ids` provided:
   a. DELETE all existing rows from `agent_documents` where `agent_id = :id`.
   b. INSERT new rows for each document_id in the request.
10. Set `agents.updated_at = now()`.
11. Return 200 with the updated agent (full details).

#### Response -- 200 OK

```ts
type UpdateAgentResponse = {
  agent: AgentWithDetails;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` not a valid UUID |
| 400 | `INVALID_NAME` | `name` provided but empty or > 255 chars |
| 400 | `INVALID_SYSTEM_PROMPT` | `system_prompt` provided but empty or > 10000 chars |
| 400 | `INVALID_DOCUMENT_IDS` | `document_ids` provided but not valid or > 100 |
| 400 | `DOCUMENT_NOT_IN_TENANT` | A document ID does not belong to the tenant |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is a viewer |
| 404 | `NOT_FOUND` | Agent not found |
| 500 | `DB_ERROR` | Postgres update failed |

---

### DELETE /api/agents/[id]

Delete an agent. All associated channels, sessions, messages, and document links are removed via CASCADE.

#### Request

`Content-Type: none` (DELETE)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The agent UUID |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. Return 404 if not found.
4. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
5. **Disconnect channels:** If any active channel exists, disconnect it first (destroy WhatsApp client, remove Telegram webhook) before deleting the row.
6. DELETE from `agents` where `id = :id`. CASCADE handles child rows.
7. Return 200.

#### Response -- 200 OK

```json
{ "deleted": true }
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is a viewer |
| 404 | `NOT_FOUND` | Agent not found |
| 500 | `DB_ERROR` | Postgres delete failed |
| 500 | `CHANNEL_DISCONNECT_ERROR` | Failed to disconnect an active channel |

---

### POST /api/agents/[id]/channels

Add a messaging channel to the agent. If a channel of the same type already exists, the old one is removed first (at most one channel per type per agent).

#### Request

`Content-Type: application/json`

```ts
type AddChannelRequest = {
  channel_type: 'whatsapp' | 'telegram';
  config: Record<string, unknown>;
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. Return 404 if not found.
4. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
5. Validate `channel_type` is `'whatsapp'` or `'telegram'`. Return 400 `INVALID_CHANNEL_TYPE` if not.
6. Validate `config` based on channel type:
   - **WhatsApp:** `config.phone_number` must be present, non-empty string. Other fields are ignored at creation time (they are populated during connect flow).
   - **Telegram:** `config.bot_token` must be present, non-empty string.
   - Return 400 `INVALID_CONFIG` if validation fails.
7. If an existing channel of the same `channel_type` exists for this agent, DELETE it first (the route handler also disconnects any active connection).
8. **Encrypt the config:** Before storing, encrypt the entire `config` JSONB value using AES-256-GCM with `AGENT_CHANNEL_ENCRYPTION_KEY`. Store the encrypted blob in the `config` column. (The ciphertext is stored as a base64-encoded JSONB wrapper.)
9. INSERT into `agent_channels` with `is_active = false` (channel is not active until the connect flow completes).
10. Return 201 with the channel (config redacted -- only `channel_type` and `is_active` are returned).

#### Response -- 201 Created

```ts
type AddChannelResponse = {
  channel: AgentChannel;
};
```

The `channel.config` field in the response is redacted -- only identifies the channel type, phone_number (WhatsApp) or bot_username (Telegram, null until connected). Never returns `bot_token` or `client_state`.

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `id` not a valid UUID |
| 400 | `INVALID_CHANNEL_TYPE` | `channel_type` is not `'whatsapp'` or `'telegram'` |
| 400 | `INVALID_CONFIG` | `config` does not contain required fields for the channel type |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is a viewer |
| 404 | `NOT_FOUND` | Agent not found |
| 500 | `DB_ERROR` | Postgres insert failed |

---

### DELETE /api/agents/[id]/channels/[channelId]

Remove a channel from the agent. If the channel is active (WhatsApp connected or Telegram webhook active), it is disconnected first.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate both UUIDs.
3. Fetch agent. Return 404 if not found.
4. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
5. Fetch channel. Return 404 if not found or not belonging to this agent.
6. If channel is active, disconnect:
   - **WhatsApp:** destroy the WhatsApp client instance.
   - **Telegram:** call `deleteWebhook` on the Telegram Bot API.
7. DELETE the channel row.
8. Return 200.

#### Response -- 200 OK

```json
{ "deleted": true }
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `id` not a valid UUID |
| 400 | `INVALID_CHANNEL_ID` | `channelId` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is a viewer |
| 404 | `AGENT_NOT_FOUND` | Agent not found |
| 404 | `CHANNEL_NOT_FOUND` | Channel not found or not belonging to agent |
| 500 | `DB_ERROR` | Postgres delete failed |
| 500 | `CHANNEL_DISCONNECT_ERROR` | Failed to disconnect active channel |

---

### POST /api/agents/[id]/chat

Playground chat for testing an agent. Follows the same SSE streaming pattern as `POST /api/assistant/chat` (P6). Uses the agent's `system_prompt` as the system message and retrieves context only from the agent's knowledge-base documents (via `agent_documents`).

#### Request

`Content-Type: application/json`

```ts
type AgentChatRequest = {
  session_id?: string;     // existing session UUID; omit to create a new session
  message: string;         // user's question (1-4000 characters)
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. RLS ensures user is in the same tenant. Return 404 if not found.
4. Validate `message`: non-empty, max 4000 chars. Return 400 `MISSING_MESSAGE` or `MESSAGE_TOO_LONG` if not.
5. **Session resolution:**
   - If `session_id` provided: fetch session, verify it belongs to this agent AND the user owns it. Return 404 if not found.
   - If no `session_id`: create a new `agent_sessions` row with `agent_id`, `user_id`, and `title = message.slice(0, 100)`.
6. Insert the user message into `agent_messages` with `channel = NULL`.
7. **RAG pipeline (agent-scoped):**
   a. Get agent's knowledge-base document IDs from `agent_documents`.
   b. If no documents selected, skip RAG -- use plain chat (no context).
   c. Generate embedding for the user's message via OpenAI.
   d. Query `document_chunks` where `document_id IN (agent's document IDs)`, ordered by `embedding <=> queryEmbedding` (cosine distance), LIMIT 5.
   e. If no chunks found (documents not ingested): fall back to plain chat with a note that the knowledge base is empty.
8. **Build RAG prompt:**
   - System: the agent's `system_prompt` + "Answer questions based on the provided document excerpts. Cite sources when possible."
   - User prompt: context chunks + conversation history (last 10 messages) + current question.
9. **Stream response via SSE:** (identical pattern to P6 assistant chat)
   - Call DeepSeek `chat/completions` with `stream: true`.
   - Emit `token` events as tokens arrive.
   - After stream completes, extract citations.
   - Emit `citations` event.
   - Save the assistant message to `agent_messages` with citations.
   - Update `agent_sessions.updated_at`.
   - Emit `done` event with `sessionId` and `messageId`.
10. On error, emit `error` event and close the stream.

#### Response -- 200 OK (SSE stream)

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: token
data: {"token":"Based"}

event: token
data: {"token":" on"}

...

event: citations
data: {"citations":[{"document_id":"...","document_name":"contract.pdf","chunk_index":2,"snippet":"..."}]}

event: done
data: {"sessionId":"...","messageId":"..."}
```

#### Errors (non-streaming -- returned as JSON before SSE starts)

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `id` not a valid UUID |
| 400 | `MISSING_MESSAGE` | `message` missing or empty |
| 400 | `MESSAGE_TOO_LONG` | `message` > 4000 characters |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `AGENT_NOT_FOUND` | Agent not found or not in user's tenant |
| 404 | `SESSION_NOT_FOUND` | `session_id` provided but not found or not owned by user |
| 500 | `EMBEDDING_ERROR` | OpenAI embedding API call failed |
| 500 | `AI_API_ERROR` | DeepSeek API call failed |
| 500 | `DB_ERROR` | Postgres query/insert failed |

---

### GET /api/agents/[id]/chat/sessions

List playground chat sessions for the specified agent. Returns only sessions owned by the current user.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. Return 404 if not found.
4. Query `agent_sessions` where `agent_id = :id AND user_id = :userId`, ordered by `updated_at DESC`.
5. Return the list.

#### Response -- 200 OK

```ts
type ListAgentSessionsResponse = {
  sessions: AgentSession[];
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `id` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Agent not found |
| 500 | `DB_ERROR` | Postgres query failed |

---

### GET /api/agents/[id]/chat/sessions/[sessionId]

Get a single session with its messages.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate both UUIDs.
3. Fetch session. RLS ensures user owns the session. Return 404 if not found or not belonging to this agent.
4. Fetch messages ordered by `created_at ASC`.
5. Return session + messages.

#### Response -- 200 OK

```ts
type GetAgentSessionResponse = {
  session: AgentSession;
  messages: AgentMessage[];
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `id` not a valid UUID |
| 400 | `INVALID_SESSION_ID` | `sessionId` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Session not found or not owned by user |
| 500 | `DB_ERROR` | Postgres query failed |

---

### DELETE /api/agents/[id]/chat/sessions/[sessionId]

Delete a session and all its messages (CASCADE).

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate both UUIDs.
3. Delete session. RLS ensures user can only delete own sessions.
4. Return 200.

#### Response -- 200 OK

```json
{ "deleted": true }
```

---

### POST /api/agents/[id]/whatsapp/connect

Initialize the WhatsApp Web connection for an agent. This starts the whatsapp-web.js Puppeteer client, captures the QR code, and returns it to the frontend for the user to scan with their WhatsApp mobile app. The QR code is ephemeral and regenerates on each connect call.

#### Precondition

A WhatsApp channel must already exist for this agent (created via `POST /api/agents/[id]/channels` with `channel_type: 'whatsapp'`). If no WhatsApp channel exists, return 400 `NO_WHATSAPP_CHANNEL`.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. Return 404 if not found.
4. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
5. Fetch the WhatsApp channel for this agent. Return 400 `NO_WHATSAPP_CHANNEL` if none exists.
6. If a WhatsApp client is already connected for this agent, return 409 `ALREADY_CONNECTED`.
7. Decrypt the channel `config` using `AGENT_CHANNEL_ENCRYPTION_KEY`.
8. Initialize a `whatsapp-web.js` Client instance with the decrypted config.
9. Register event handlers:
   - **`qr` event:** Capture the QR string. Store it temporarily for polling via the status endpoint. The QR is valid for ~20 seconds. If not scanned within 30 seconds, the client regenerates a new QR.
   - **`ready` event:** The user has scanned the QR. Update `agent_channels.is_active = true`, persist the client session state to the encrypted `config` column, clear the temporary QR.
   - **`message` event:** Incoming WhatsApp messages are processed by the channel message handler (see Architecture Section 15).
   - **`disconnected` event:** Update `agent_channels.is_active = false`.
10. Start the WhatsApp client (this triggers Puppeteer and the QR flow).
11. Return 200 with `status: 'qr_pending'` and `message`. The frontend should then poll `GET /api/agents/[id]/whatsapp/status` to get the QR code.

#### Response -- 200 OK

```ts
type WhatsAppConnectResponse = {
  channel_id: string;
  status: 'qr_pending';
  qr_code: undefined;        // QR is delivered via the status endpoint
  message: string;           // "WhatsApp client initializing. Poll /status for the QR code."
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `id` not a valid UUID |
| 400 | `NO_WHATSAPP_CHANNEL` | No WhatsApp channel exists for this agent |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is a viewer |
| 404 | `AGENT_NOT_FOUND` | Agent not found |
| 409 | `ALREADY_CONNECTED` | WhatsApp is already connected for this agent |
| 500 | `CHANNEL_INIT_ERROR` | Failed to initialize WhatsApp client (Puppeteer error) |

---

### GET /api/agents/[id]/whatsapp/status

Poll for the current WhatsApp connection status. Used during the QR scan flow: the frontend calls this endpoint every 2 seconds while the QR modal is open.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Fetch agent. Return 404 if not found.
4. Fetch the WhatsApp channel. Return 404 if none exists.
5. Return the current status snapshot from the in-memory WhatsApp client state:
   - `disconnected`: No active client.
   - `qr_pending`: Client is waiting for QR scan. `qr_code` field contains the QR string.
   - `connecting`: QR has been scanned, authentication in progress.
   - `connected`: Client is ready. `phone_number` field contains the connected number.

#### Response -- 200 OK

```ts
type WhatsAppStatusResponse = {
  channel_id: string;
  status: 'disconnected' | 'qr_pending' | 'connecting' | 'connected';
  qr_code?: string;            // present only when status = 'qr_pending'
  phone_number?: string;       // present only when status = 'connected'
};
```

Example (QR pending):
```json
{
  "channel_id": "uuid-...",
  "status": "qr_pending",
  "qr_code": "1@ABCDEFGH..."
}
```

Example (connected):
```json
{
  "channel_id": "uuid-...",
  "status": "connected",
  "phone_number": "+1234567890"
}
```

---

### POST /api/agents/[id]/whatsapp/disconnect

Disconnect the WhatsApp client and destroy the Puppeteer session. The channel row is NOT deleted -- only deactivated. The user can reconnect later.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id`. Fetch agent. Return 404 if not found.
3. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
4. Fetch the WhatsApp channel. Return 404 if none exists.
5. If the WhatsApp client instance exists, call `client.destroy()` to shut down Puppeteer.
6. Update `agent_channels.is_active = false`.
7. Clear the in-memory client reference.
8. Return 200.

#### Response -- 200 OK

```json
{ "disconnected": true }
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 404 | `NOT_FOUND` | Agent or WhatsApp channel not found |
| 500 | `DISCONNECT_ERROR` | Failed to destroy WhatsApp client |

---

### POST /api/agents/[id]/telegram/connect

Connect a Telegram bot to the agent. This validates the bot token, retrieves the bot's username, and registers a webhook with Telegram so incoming messages are sent to inTrustVault's webhook endpoint.

#### Precondition

A Telegram channel must already exist for this agent (created via `POST /api/agents/[id]/channels` with `channel_type: 'telegram'`).

#### Request

`Content-Type: application/json`

```ts
type TelegramConnectRequest = {
  bot_token: string;           // the Telegram Bot API token from @BotFather
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id`. Fetch agent. Return 404 if not found.
3. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
4. Fetch the Telegram channel for this agent. Return 400 `NO_TELEGRAM_CHANNEL` if none exists.
5. Validate `bot_token` format (roughly `digits:alphanumeric`). Return 400 `INVALID_BOT_TOKEN` if not.
6. Call Telegram Bot API `getMe` to validate the token and retrieve the bot's username.
   - If the API returns an error, return 400 `INVALID_BOT_TOKEN` with the Telegram error description.
7. Encrypt the `bot_token` using `AGENT_CHANNEL_ENCRYPTION_KEY` and store it in the channel's `config`.
8. Register the webhook with Telegram:
   - Call `setWebhook` with `url = {APP_URL}/api/webhook/telegram/{agentId}`.
   - If webhook registration fails, return 500 `WEBHOOK_REGISTRATION_ERROR`.
9. Create a `node-telegram-bot-api` instance for this agent (or register the agent in a global bot registry) to handle incoming updates via the webhook.
10. Update `agent_channels`:
    - Encrypt and update `config` with `{ bot_token, bot_username, webhook_url }`.
    - Set `is_active = true`.
11. Return 200 with the bot username and webhook URL.

#### Response -- 200 OK

```ts
type TelegramConnectResponse = {
  channel_id: string;
  bot_username: string;        // from getMe()
  webhook_url: string;         // the registered webhook URL
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `id` not a valid UUID |
| 400 | `NO_TELEGRAM_CHANNEL` | No Telegram channel exists for this agent |
| 400 | `INVALID_BOT_TOKEN` | `bot_token` is missing, empty, or rejected by Telegram |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is a viewer |
| 404 | `AGENT_NOT_FOUND` | Agent not found |
| 500 | `WEBHOOK_REGISTRATION_ERROR` | Failed to register webhook with Telegram |
| 500 | `DB_ERROR` | Postgres update failed |

---

### POST /api/agents/[id]/telegram/disconnect

Disconnect the Telegram bot. Removes the webhook registration and deactivates the channel.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id`. Fetch agent. Return 404 if not found.
3. `requireTenantRole(user.id, ['owner', 'admin', 'editor'])` -- return 403 if viewer.
4. Fetch the Telegram channel. Return 404 if none exists.
5. Decrypt the channel `config` to get the `bot_token`.
6. Call Telegram Bot API `deleteWebhook` with the bot token.
7. Remove the bot instance from the global registry.
8. Update `agent_channels.is_active = false`.
9. Return 200.

#### Response -- 200 OK

```json
{ "disconnected": true }
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 404 | `NOT_FOUND` | Agent or Telegram channel not found |
| 500 | `DISCONNECT_ERROR` | Failed to delete webhook or update DB |

---

### POST /api/webhook/whatsapp/[agentId]

Receive incoming WhatsApp messages. **Reserved for future WhatsApp Business API integration.** With the unofficial whatsapp-web.js library, incoming messages are handled internally via the client's `message` event, not through webhooks. This endpoint is defined for forward compatibility.

#### Auth

No Supabase session required. This endpoint is called by external services (WhatsApp Business API). Validation is done via a shared secret in a custom header (`X-Webhook-Secret` compared against `WHATSAPP_WEBHOOK_SECRET` env var). Return 401 if the header is missing or incorrect.

#### Processing

1. Validate `agentId` UUID.
2. Verify `X-Webhook-Secret` header matches `WHATSAPP_WEBHOOK_SECRET`.
3. Fetch agent. Return 404 if not found or `is_active = false`.
4. Process the incoming message through the channel handler (same pipeline as the `message` event handler).
5. Return 200.

**Note for P16:** This endpoint is not used with whatsapp-web.js (unofficial). It is a placeholder for future WhatsApp Business API support. In P16, WhatsApp messages arrive via the `message` event on the whatsapp-web.js Client instance, which is handled by a server-side event listener registered during `POST /api/agents/[id]/whatsapp/connect`.

---

### POST /api/webhook/telegram/[agentId]

Receive incoming Telegram messages via webhook. Called by Telegram's servers when a user sends a message to the connected bot.

#### Auth

No Supabase session required. This endpoint is called by Telegram servers. The request contains a Telegram update object. Validation: verify the incoming `update` payload and the agent's existence.

#### Processing

1. Validate `agentId` UUID.
2. Fetch agent. Return 404 if not found or `is_active = false`.
3. Fetch the Telegram channel for this agent. Return 404 if none exists or `is_active = false`.
4. Parse the Telegram update from the request body.
5. Extract the message text and sender information (`chat.id`, `from.id`, `from.first_name`).
6. **Create or find session:** Look up an existing `agent_sessions` for this agent + external user (using `external_user_id`). If none exists, create a new session with `title = 'Telegram: {from.first_name}'`.
7. Insert the user message into `agent_messages` with `channel = 'telegram'` and `external_user_id = chat.id.toString()`.
8. **Run RAG pipeline** (same as playground chat, scoped to agent's knowledge docs).
9. Insert the assistant response into `agent_messages`.
10. Decrypt the `bot_token` from the channel config.
11. Send the assistant response back to the Telegram chat via `sendMessage` API call.
12. Return 200.

#### Response -- 200 OK

```json
{ "ok": true }
```

Telegram expects a 200 response to acknowledge receipt. The actual reply is sent via the `sendMessage` API call.

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_AGENT_ID` | `agentId` not a valid UUID |
| 404 | `AGENT_NOT_FOUND` | Agent not found or inactive |
| 404 | `CHANNEL_NOT_FOUND` | No active Telegram channel for this agent |
| 500 | `PROCESSING_ERROR` | Failed to process message or send reply |

---

## P16 Environment Variables

| Variable | Used by |
|---|---|
| `AGENT_CHANNEL_ENCRYPTION_KEY` | Server-side AES-256-GCM encryption key for channel credentials. Must be a 32-byte base64-encoded string. Generate via `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `APP_URL` | Public URL of the deployed application (e.g., `https://intrustvault.vercel.app`). Used for Telegram webhook URL construction. |
| `TELEGRAM_WEBHOOK_SECRET` | (Optional) Secret for validating Telegram webhook requests. If set, the webhook endpoint checks the `X-Telegram-Bot-Api-Secret-Token` header. |
| `WHATSAPP_WEBHOOK_SECRET` | (Future) Secret for validating WhatsApp Business API webhook requests. Not used in P16 with whatsapp-web.js unofficial. |

These are in addition to all existing P1-P14 environment variables.

---

## P16 Role Requirement Summary

| Endpoint | Method | P16 Minimum Role |
|---|---|---|
| `/api/agents` | `POST` | `editor` |
| `/api/agents` | `GET` | `viewer` |
| `/api/agents/[id]` | `GET` | `viewer` |
| `/api/agents/[id]` | `PATCH` | `editor` |
| `/api/agents/[id]` | `DELETE` | `editor` |
| `/api/agents/[id]/channels` | `POST` | `editor` |
| `/api/agents/[id]/channels/[channelId]` | `DELETE` | `editor` |
| `/api/agents/[id]/chat` | `POST` | `viewer` |
| `/api/agents/[id]/chat/sessions` | `GET` | `viewer` |
| `/api/agents/[id]/chat/sessions/[sessionId]` | `GET` | `viewer` |
| `/api/agents/[id]/chat/sessions/[sessionId]` | `DELETE` | `viewer` (own sessions only) |
| `/api/agents/[id]/whatsapp/connect` | `POST` | `editor` |
| `/api/agents/[id]/whatsapp/disconnect` | `POST` | `editor` |
| `/api/agents/[id]/whatsapp/status` | `GET` | `editor` |
| `/api/agents/[id]/telegram/connect` | `POST` | `editor` |
| `/api/agents/[id]/telegram/disconnect` | `POST` | `editor` |
| `/api/webhook/whatsapp/[agentId]` | `POST` | N/A (webhook auth) |
| `/api/webhook/telegram/[agentId]` | `POST` | N/A (webhook) |
