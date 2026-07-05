// ---------------------------------------------------------------------------
// TrustVault — Database Row Validation Schemas (Zod)
// ---------------------------------------------------------------------------
// Every DB row returned by Supabase is `unknown` at the type level.
// These schemas + parse functions replace the unsafe `as unknown as T` pattern
// with validated parsing. If a DB row doesn't match the expected shape, we
// get a clear Zod error instead of a silent runtime crash.
// ---------------------------------------------------------------------------

import { z } from "zod";

// ---- Base / Reusable fragments -------------------------------------------

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().datetime({ offset: true });
const nullableIsoDate = isoDateSchema.nullable();
const hex64Schema = z.string().regex(/^[0-9a-f]{64}$/i, "Must be 64-char hex");

// ---- Tenant ---------------------------------------------------------------

export const TenantRowSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  plan: z.enum(["free", "pro", "enterprise"]),
  usage_documents: z.number().int(),
  usage_llm_calls: z.number().int(),
  usage_storage_bytes: z.number().int(),
  usage_reset_at: nullableIsoDate,
  created_at: isoDateSchema,
});

export type TenantRow = z.output<typeof TenantRowSchema>;

// ---- Profile --------------------------------------------------------------

export const RoleSchema = z.enum(["owner", "admin", "editor", "viewer"]);

export const ProfileRowSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  display_name: z.string().nullable(),
  role: RoleSchema.default("viewer"),
  created_at: isoDateSchema,
});

export type ProfileRow = z.output<typeof ProfileRowSchema>;

// ---- Document -------------------------------------------------------------

export const DocumentRowSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  original_filename: z.string().nullable(),
  storage_path: z.string(),
  binary_hash: hex64Schema,
  text_hash: hex64Schema,
  extracted_text: z.string(),
  file_size_bytes: z.number().int().nonnegative(),
  file_type: z.string(),
  tenant_id: uuidSchema,
  uploaded_by: uuidSchema,
  created_at: isoDateSchema,
  deleted_at: nullableIsoDate.optional(),
  deleted_by: uuidSchema.nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  fingerprint: z.string().nullable(),
  chain: z.string().nullable(),
  tx_hash: z.string().nullable(),
  anchored_at: nullableIsoDate.optional(),
});

export type DocumentRow = z.output<typeof DocumentRowSchema>;

// ---- Document Chunk -------------------------------------------------------

export const DocumentChunkRowSchema = z.object({
  id: uuidSchema,
  document_id: uuidSchema,
  chunk_index: z.number().int().nonnegative(),
  content: z.string(),
  embedding: z.unknown().nullable(), // vector → parsed as number[] or string at app level
  token_count: z.number().int().default(0),
  created_at: isoDateSchema,
});

export type DocumentChunkRow = z.output<typeof DocumentChunkRowSchema>;

// ---- Chat Session ---------------------------------------------------------

export const ChatSessionRowSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  title: z.string(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export type ChatSessionRow = z.output<typeof ChatSessionRowSchema>;

// ---- Chat Message ---------------------------------------------------------

export const ChatMessageRowSchema = z.object({
  id: uuidSchema,
  session_id: uuidSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.unknown().nullable(), // jsonb
  created_at: isoDateSchema,
});

export type ChatMessageRow = z.output<typeof ChatMessageRowSchema>;

// ---- Shared Link ----------------------------------------------------------

export const SharedLinkRowSchema = z.object({
  id: uuidSchema,
  document_ids: z.array(z.string().uuid()),
  token: z.string().length(32),
  created_by: uuidSchema,
  allow_download: z.boolean(),
  allow_chat: z.boolean(),
  allow_anchor: z.boolean().default(false),
  allow_compare: z.boolean().default(false),
  title: z.string(),
  is_active: z.boolean(),
  created_at: isoDateSchema,
  expires_at: nullableIsoDate,
});

export type SharedLinkRow = z.output<typeof SharedLinkRowSchema>;

// ---- Invitation -----------------------------------------------------------

export const InvitationRowSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]),
  token: z.string().length(64),
  created_by: uuidSchema,
  created_at: isoDateSchema,
  expires_at: isoDateSchema,
  accepted_at: nullableIsoDate,
});

export type InvitationRow = z.output<typeof InvitationRowSchema>;

// ---- LLM Usage Log --------------------------------------------------------

export const LlmUsageLogRowSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  endpoint: z.string(),
  tokens_used: z.number().int().default(0),
  created_at: isoDateSchema,
});

export type LlmUsageLogRow = z.output<typeof LlmUsageLogRowSchema>;

// ---- Label ----------------------------------------------------------------

export const LabelRowSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  color: z.string().nullable(),
  created_at: isoDateSchema,
});

export type LabelRow = z.output<typeof LabelRowSchema>;

// ════════════════════════════════════════════════════════════════════════════
// Type-safe parse functions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Parses a raw DB row into a typed object. On mismatch, throws ZodError
 * with a clear message including the expected type name.
 */
function parseRow<T>(schema: z.ZodType<T>, row: unknown, typeName: string): T {
  try {
    return schema.parse(row) as T;
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new z.ZodError([
        ...err.issues,
        {
          code: "custom",
          path: [],
          message: `Failed to parse '${typeName}' row: ${issues}`,
        },
      ]);
    }
    throw err;
  }
}

export const parseDocument = (row: unknown) => parseRow(DocumentRowSchema, row, "Document");
export const parseTenant = (row: unknown) => parseRow(TenantRowSchema, row, "Tenant");
export const parseProfile = (row: unknown) => parseRow(ProfileRowSchema, row, "Profile");
export const parseDocumentChunk = (row: unknown) => parseRow(DocumentChunkRowSchema, row, "DocumentChunk");
export const parseChatSession = (row: unknown) => parseRow(ChatSessionRowSchema, row, "ChatSession");
export const parseChatMessage = (row: unknown) => parseRow(ChatMessageRowSchema, row, "ChatMessage");
export const parseSharedLink = (row: unknown) => parseRow(SharedLinkRowSchema, row, "SharedLink");
export const parseInvitation = (row: unknown) => parseRow(InvitationRowSchema, row, "Invitation");
export const parseLlmUsageLog = (row: unknown) => parseRow(LlmUsageLogRowSchema, row, "LlmUsageLog");
export const parseLabel = (row: unknown) => parseRow(LabelRowSchema, row, "Label");
