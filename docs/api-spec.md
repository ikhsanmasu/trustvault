# TrustVault — API Specification (P1)

This document is a **contract**. The `backend` agent implements exactly what is written here and the `frontend` agent calls exactly what is written here. Neither agent may silently change paths, field names, or types — discrepancies must be flagged back to the architect.

---

## Conventions

- All endpoints are under `/api/`.
- Request bodies (where applicable) use `Content-Type: application/json` except where `multipart/form-data` is noted.
- All successful responses return `Content-Type: application/json`.
- Timestamps are ISO 8601 strings in UTC (e.g. `"2026-06-21T10:00:00.000Z"`).
- UUIDs are lowercase hyphenated strings (e.g. `"550e8400-e29b-41d4-a716-446655440000"`).
- Type annotations use TypeScript notation. `?` suffix means optional.

### Standard Error Shape

All error responses use this shape:

```ts
type ErrorResponse = {
  error: string;   // human-readable message
  code?: string;   // machine-readable code (see per-endpoint error codes)
};
```

### HTTP Status Codes

| Status | Meaning |
|---|---|
| 200 | Success (GET, POST compare) |
| 201 | Created (POST documents) |
| 400 | Bad request (validation failure) |
| 404 | Resource not found |
| 413 | File too large |
| 415 | Unsupported media type |
| 500 | Internal server error |

---

## Shared Types

```ts
// The document record returned by all document endpoints
type Document = {
  id: string;             // UUID
  name: string;           // user-supplied display name
  storage_path: string;   // path within the pdf-uploads bucket
  binary_hash: string;    // SHA-256 hex of raw file bytes (64 chars)
  text_hash: string;      // SHA-256 hex of extracted text (64 chars)
  extracted_text: string; // full extracted text (may be empty string)
  file_size_bytes: number;
  tenant_id: string | null;  // always null in P1
  project_id: string | null; // always null in P1
  created_at: string;     // ISO 8601 UTC
};
```

---

## Endpoints

---

### POST /api/documents

Upload a PDF document. Computes binary and text hashes, stores the file in Supabase Storage, and inserts a row in `documents`.

#### Request

`Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File (PDF) | Yes | The PDF file to upload. Max 20 MB. Must be `application/pdf`. |
| `name` | string | Yes | Display name for the document (1–255 characters). |

#### Processing (in order — this is the contract for backend implementation)

1. Validate that `file` is present and `Content-Type` is `application/pdf`.
2. Validate file size ≤ 20 MB (20,971,520 bytes). Return 413 if exceeded.
3. Validate that `name` is a non-empty string with length ≤ 255.
4. Read the file into a `Buffer`.
5. Call `computeBinaryHash(buffer)` → `binaryHash`.
6. Call `extractPdfText(buffer)` → `extractedText` (empty string on corrupt/blank PDF — never throw).
7. Call `computeTextHash(extractedText)` → `textHash`.
8. Generate a new UUID for the storage path: `uploads/{UTC_year}/{uuid}.pdf`.
9. Upload the buffer to Supabase Storage bucket `pdf-uploads` at that path using the service-role key.
10. Insert a row into `documents` with all computed values.
11. Return 201 with the created document record.

#### Response — 201 Created

```ts
type UploadResponse = {
  document: Document;
};
```

Example:
```json
{
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Contract v1",
    "storage_path": "uploads/2026/3f2504e0-4f89-11d3-9a0c-0305e82c3301.pdf",
    "binary_hash": "a3f5...c9d2",
    "text_hash": "b7e1...4a8f",
    "extracted_text": "This agreement is made between...",
    "file_size_bytes": 204800,
    "tenant_id": null,
    "project_id": null,
    "created_at": "2026-06-21T10:00:00.000Z"
  }
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `MISSING_FILE` | No `file` field in form data |
| 400 | `MISSING_NAME` | `name` field missing or empty |
| 400 | `NAME_TOO_LONG` | `name` exceeds 255 characters |
| 413 | `FILE_TOO_LARGE` | File exceeds 20 MB |
| 415 | `INVALID_FILE_TYPE` | File is not `application/pdf` |
| 500 | `STORAGE_ERROR` | Supabase Storage upload failed |
| 500 | `DB_ERROR` | Postgres insert failed |

---

### GET /api/documents

List all documents ordered by `created_at` descending (newest first). Supports an optional search query on document name.

#### Request

`Content-Type: none` (GET with query parameters)

| Query param | Type | Required | Description |
|---|---|---|---|
| `search` | string | No | Case-insensitive substring match against `documents.name`. If omitted or empty, all documents are returned. |
| `limit` | number | No | Maximum number of results to return. Default: 50. Max: 200. |
| `offset` | number | No | Number of rows to skip (for pagination). Default: 0. |

#### Processing

1. Parse and validate query params.
2. If `search` is provided and non-empty, filter with `WHERE name ILIKE '%{search}%'`.
3. Order by `created_at DESC`.
4. Apply `LIMIT` and `OFFSET`.
5. Return the list.

**Note:** `extracted_text` is included in each returned document. Callers that do not need it (e.g. the list view) should ignore it. A future optimisation may add a `fields` param, but for P1 the full record is always returned.

#### Response — 200 OK

```ts
type ListDocumentsResponse = {
  documents: Document[];
  total: number;   // total matching rows (ignoring limit/offset), for pagination display
};
```

Example:
```json
{
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Contract v1",
      ...
    }
  ],
  "total": 1
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_LIMIT` | `limit` is not a positive integer or exceeds 200 |
| 400 | `INVALID_OFFSET` | `offset` is not a non-negative integer |
| 500 | `DB_ERROR` | Postgres query failed |

---

### GET /api/documents/[id]

Fetch a single document by its UUID.

#### Request

`Content-Type: none` (GET with path parameter)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The document UUID |

#### Processing

1. Validate that `id` is a valid UUID format (reject non-UUID strings with 400).
2. Query `SELECT * FROM documents WHERE id = $1`.
3. Return 404 if no row found.
4. Return 200 with the document.

#### Response — 200 OK

```ts
type GetDocumentResponse = {
  document: Document;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` is not a valid UUID |
| 404 | `NOT_FOUND` | No document with that ID |
| 500 | `DB_ERROR` | Postgres query failed |

---

### POST /api/compare

Compare two documents by their IDs. Runs the three-step deterministic pipeline (binary hash → text hash → AI). The AI is called **only** if the text hashes differ.

#### Request

`Content-Type: application/json`

```ts
type CompareRequest = {
  docAId: string;  // UUID of document A (the "baseline" or older version)
  docBId: string;  // UUID of document B (the "new" version being compared)
};
```

| Field | Type | Required | Description |
|---|---|---|---|
| `docAId` | string (UUID) | Yes | ID of the first document |
| `docBId` | string (UUID) | Yes | ID of the second document |

#### Processing (in order — this is the contract for backend implementation)

1. Validate both `docAId` and `docBId` are valid UUID strings. Return 400 if not.
2. Validate they are not identical (comparing a document to itself is a no-op). Return 400 with `SAME_DOCUMENT` if they are equal.
3. Fetch both document records from Postgres. Return 404 if either is not found (include which ID was missing in the `error` message).
4. **Step 1 — Binary hash check:** Compare `docA.binary_hash` and `docB.binary_hash`.
   - Equal → return 200 with `stage: "BINARY_MATCH"`, `verdict: "IDENTICAL"`, no AI call.
5. **Step 2 — Text hash check:** Compare `docA.text_hash` and `docB.text_hash`.
   - Equal → return 200 with `stage: "TEXT_MATCH"`, `verdict: "BINARY_DIFF_ONLY"`, no AI call.
6. **Step 3 — AI compare:** Call `buildComparePrompt(docA.extracted_text, docB.extracted_text)` then POST to DeepSeek API. Parse and validate response with `parseAIResponse()`. Return 200 with the AI verdict.

#### DeepSeek API Call (Step 3)

**Endpoint:** `POST https://api.deepseek.com/chat/completions`

**Headers:**
```
Authorization: Bearer {DEEPSEEK_API_KEY}
Content-Type: application/json
```

**Request body:**
```json
{
  "model": "deepseek-chat",
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "<system prompt from buildComparePrompt>" },
    { "role": "user", "content": "<user prompt from buildComparePrompt>" }
  ]
}
```

**Prompt construction — `buildComparePrompt(textA, textB)`:**

System prompt (verbatim):
```
You are a document-integrity reviewer. Your job is to assess whether a change between two versions
of a document is MATERIAL or NOT_MATERIAL.

A MATERIAL change alters the meaning, value, legal obligations, named parties, dates, amounts,
or other substantive content of the document.

A NOT_MATERIAL change is purely cosmetic: whitespace, punctuation, reformatting, or rewording
that does not alter the substance.

You must respond with a JSON object matching this exact schema:
{
  "verdict": "MATERIAL" | "NOT_MATERIAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "<one to three sentences explaining the verdict>"
}

Do not include any text outside the JSON object.
```

User prompt (verbatim template — `{TEXT_A}` and `{TEXT_B}` are replaced with actual text):
```
## Document A (baseline)

{TEXT_A}

## Document B (new version)

{TEXT_B}

Assess whether the change from Document A to Document B is MATERIAL or NOT_MATERIAL.
```

**Text truncation:** If either text exceeds 40,000 characters, truncate it to the first 40,000 characters before embedding in the prompt. Append `"\n[TRUNCATED]"` at the end of the truncated text so the AI is aware. This prevents prompt size errors.

**Expected AI JSON response:**

```ts
type AIVerdict = {
  verdict: "MATERIAL" | "NOT_MATERIAL";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;   // 1–3 sentences
};
```

The Zod schema used for validation (`parseAIResponse`):
```ts
const AIVerdictSchema = z.object({
  verdict: z.enum(["MATERIAL", "NOT_MATERIAL"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasoning: z.string().min(1).max(1000),
});
```

If the AI response does not parse or validate, return 500 with `code: "AI_PARSE_ERROR"`.

#### Response — 200 OK

```ts
type CompareResponse = {
  docAId: string;
  docBId: string;
  stage: "BINARY_MATCH" | "TEXT_MATCH" | "AI_COMPARE";
  verdict: "IDENTICAL" | "BINARY_DIFF_ONLY" | "MATERIAL" | "NOT_MATERIAL";
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;  // null when stage is not AI_COMPARE
  reasoning: string | null;   // null when stage is not AI_COMPARE
};
```

**Stage / verdict mapping:**

| Stage | Meaning | Verdict values |
|---|---|---|
| `BINARY_MATCH` | Both binary hashes are equal; files are byte-for-byte identical | `IDENTICAL` |
| `TEXT_MATCH` | Binary hashes differ but text hashes are equal; text content is the same | `BINARY_DIFF_ONLY` |
| `AI_COMPARE` | Text hashes differ; AI assessed the materiality of the change | `MATERIAL` or `NOT_MATERIAL` |

Example — AI compared and found the change material:
```json
{
  "docAId": "550e8400-e29b-41d4-a716-446655440000",
  "docBId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "stage": "AI_COMPARE",
  "verdict": "MATERIAL",
  "confidence": "HIGH",
  "reasoning": "The payment amount in clause 3.1 was changed from $10,000 to $25,000, which materially alters the financial obligation of the parties."
}
```

Example — binary match:
```json
{
  "docAId": "...",
  "docBId": "...",
  "stage": "BINARY_MATCH",
  "verdict": "IDENTICAL",
  "confidence": null,
  "reasoning": null
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_DOC_A_ID` | `docAId` is not a valid UUID |
| 400 | `INVALID_DOC_B_ID` | `docBId` is not a valid UUID |
| 400 | `SAME_DOCUMENT` | `docAId` and `docBId` are identical |
| 404 | `DOC_A_NOT_FOUND` | Document with `docAId` does not exist |
| 404 | `DOC_B_NOT_FOUND` | Document with `docBId` does not exist |
| 500 | `DB_ERROR` | Postgres query failed |
| 500 | `AI_API_ERROR` | DeepSeek API call failed (network or HTTP error) |
| 500 | `AI_PARSE_ERROR` | DeepSeek response did not match the expected schema |

---

## File Storage in Supabase Storage

- Files are uploaded using the **service-role client** (`SUPABASE_SERVICE_ROLE_KEY`).
- The bucket name is `pdf-uploads` (private; see `database.md`).
- The path format is `uploads/{UTC_year}/{uuid}.pdf`.
- The route handler uploads the file buffer directly — no signed URLs are needed for P1 uploads (server-side only).
- File retrieval for AI compare uses the pre-stored `extracted_text` column — the raw file is NOT re-fetched from Storage for comparison. Storage is write-once in P1.

---

## Environment Variables Used by Route Handlers

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client initialisation |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client initialisation (public operations if any) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase client (Storage + Postgres) |
| `DEEPSEEK_API_KEY` | Authorization header for DeepSeek API calls |

`DEEPSEEK_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the browser. They are used only in route handlers (server-side).
