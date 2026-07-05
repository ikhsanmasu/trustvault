// ---------------------------------------------------------------------------
// TrustVault — DB Schema Validation Tests
// ---------------------------------------------------------------------------
// Verifies that Zod schemas correctly validate real-looking DB rows.
// Each schema is tested with: valid rows, missing required fields, wrong types.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  DocumentRowSchema,
  TenantRowSchema,
  ProfileRowSchema,
  SharedLinkRowSchema,
  AgentRowSchema,
  AgentChannelRowSchema,
  AgentSessionRowSchema,
  AgentMessageRowSchema,
  InvitationRowSchema,
  ChatSessionRowSchema,
  ChatMessageRowSchema,
  parseDocument,
  parseTenant,
  parseProfile,
  parseSharedLink,
  parseAgent,
  parseAgentChannel,
  parseAgentSession,
  parseAgentMessage,
  parseInvitation,
  parseChatSession,
  parseChatMessage,
} from "@/lib/db-schemas";

// ════════════════════════════════════════════════════════════════════════════
// 1. DocumentRow — the most critical table (all features depend on it)
// ════════════════════════════════════════════════════════════════════════════

describe("DocumentRow Schema", () => {
  const validDoc = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Contract Agreement.pdf",
    original_filename: "Contract Agreement v2.pdf",
    storage_path: "uploads/2026/abc123.pdf",
    binary_hash: "a".repeat(64),
    text_hash: "b".repeat(64),
    extracted_text: "Lorem ipsum dolor sit amet...",
    file_size_bytes: 2048576,
    file_type: "application/pdf",
    tenant_id: "550e8400-e29b-41d4-a716-446655440001",
    uploaded_by: "550e8400-e29b-41d4-a716-446655440003",
    created_at: "2026-07-05T10:30:00.000Z",
    deleted_at: null,
    deleted_by: null,
    description: "Main client contract",
    notes: "Signed by both parties on 2026-06-15",
    fingerprint: null,
    chain: null,
    tx_hash: null,
    anchored_at: null,
  };

  it("accepts valid document row", () => {
    expect(() => DocumentRowSchema.parse(validDoc)).not.toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => DocumentRowSchema.parse({})).toThrow();
    expect(() => DocumentRowSchema.parse({ id: validDoc.id })).toThrow();
  });

  it("rejects invalid UUID", () => {
    expect(() => DocumentRowSchema.parse({ ...validDoc, id: "not-a-uuid" })).toThrow();
  });

  it("rejects non-hex binary_hash", () => {
    expect(() => DocumentRowSchema.parse({ ...validDoc, binary_hash: "xyz" })).toThrow();
  });

  it("rejects negative file_size_bytes", () => {
    expect(() => DocumentRowSchema.parse({ ...validDoc, file_size_bytes: -1 })).toThrow();
  });

  it("parseDocument returns typed object", () => {
    const doc = parseDocument(validDoc);
    expect(doc.id).toBe(validDoc.id);
    expect(doc.name).toBe(validDoc.name);
    expect(doc.extracted_text).toBe(validDoc.extracted_text);
  });

  it("parseDocument throws on invalid row", () => {
    expect(() => parseDocument(null)).toThrow();
    expect(() => parseDocument({})).toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. TenantRow
// ════════════════════════════════════════════════════════════════════════════

describe("TenantRow Schema", () => {
  const validTenant = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Acme Corp",
    plan: "pro" as const,
    usage_documents: 42,
    usage_llm_calls: 150,
    usage_storage_bytes: 104857600,
    usage_reset_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-01-15T08:00:00.000Z",
  };

  it("accepts valid tenant row", () => {
    expect(() => TenantRowSchema.parse(validTenant)).not.toThrow();
  });

  it("rejects invalid plan", () => {
    expect(() => TenantRowSchema.parse({ ...validTenant, plan: "ultimate" })).toThrow();
  });

  it("accepts all valid plans", () => {
    for (const plan of ["free", "pro", "enterprise"]) {
      expect(() => TenantRowSchema.parse({ ...validTenant, plan })).not.toThrow();
    }
  });

  it("parseTenant returns typed object", () => {
    const t = parseTenant(validTenant);
    expect(t.name).toBe("Acme Corp");
    expect(t.plan).toBe("pro");
    expect(t.usage_documents).toBe(42);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. ProfileRow
// ════════════════════════════════════════════════════════════════════════════

describe("ProfileRow Schema", () => {
  const validProfile = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    tenant_id: "550e8400-e29b-41d4-a716-446655440001",
    display_name: "Alice",
    role: "owner" as const,
    created_at: "2026-01-15T08:00:00.000Z",
  };

  it("accepts all roles", () => {
    for (const role of ["owner", "admin", "editor", "viewer"]) {
      expect(() => ProfileRowSchema.parse({ ...validProfile, role })).not.toThrow();
    }
  });

  it("rejects invalid role", () => {
    expect(() => ProfileRowSchema.parse({ ...validProfile, role: "superadmin" })).toThrow();
  });

  it("parseProfile returns typed object", () => {
    const p = parseProfile(validProfile);
    expect(p.role).toBe("owner");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. SharedLinkRow
// ════════════════════════════════════════════════════════════════════════════

describe("SharedLinkRow Schema", () => {
  const validShare = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    document_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    token: "a".repeat(32),
    created_by: "550e8400-e29b-41d4-a716-446655440002",
    allow_download: true,
    allow_chat: true,
    allow_anchor: false,
    allow_compare: false,
    title: "Q3 Contracts",
    is_active: true,
    created_at: "2026-07-05T10:30:00.000Z",
    expires_at: null,
  };

  it("accepts valid share link", () => {
    expect(() => SharedLinkRowSchema.parse(validShare)).not.toThrow();
  });

  it("rejects token with wrong length", () => {
    expect(() => SharedLinkRowSchema.parse({ ...validShare, token: "short" })).toThrow();
  });

  it("rejects non-array document_ids", () => {
    expect(() => SharedLinkRowSchema.parse({ ...validShare, document_ids: "not-array" })).toThrow();
  });

  it("parseSharedLink returns typed object", () => {
    const s = parseSharedLink(validShare);
    expect(s.token).toBe("a".repeat(32));
    expect(s.document_ids).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. AgentRow
// ════════════════════════════════════════════════════════════════════════════

describe("AgentRow Schema", () => {
  const validAgent = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    tenant_id: "550e8400-e29b-41d4-a716-446655440001",
    name: "Legal Document Reviewer",
    system_prompt: "You are a legal document review assistant.",
    created_by: "550e8400-e29b-41d4-a716-446655440002",
    is_active: true,
    created_at: "2026-07-05T10:30:00.000Z",
    updated_at: "2026-07-05T10:30:00.000Z",
  };

  it("accepts valid agent", () => {
    expect(() => AgentRowSchema.parse(validAgent)).not.toThrow();
  });

  it("rejects empty name", () => {
    expect(() => AgentRowSchema.parse({ ...validAgent, name: "" })).toThrow();
  });

  it("rejects name > 255 chars", () => {
    expect(() => AgentRowSchema.parse({ ...validAgent, name: "x".repeat(256) })).toThrow();
  });

  it("rejects empty system_prompt", () => {
    expect(() => AgentRowSchema.parse({ ...validAgent, system_prompt: "" })).toThrow();
  });

  it("parseAgent returns typed object", () => {
    const a = parseAgent(validAgent);
    expect(a.name).toBe("Legal Document Reviewer");
    expect(a.is_active).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. InvitationRow
// ════════════════════════════════════════════════════════════════════════════

describe("InvitationRow Schema", () => {
  const validInvite = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    tenant_id: "550e8400-e29b-41d4-a716-446655440001",
    email: "bob@example.com",
    role: "editor" as const,
    token: "a".repeat(64),
    created_by: "550e8400-e29b-41d4-a716-446655440002",
    created_at: "2026-07-05T10:30:00.000Z",
    expires_at: "2026-07-12T10:30:00.000Z",
    accepted_at: null,
  };

  it("accepts valid invitation", () => {
    expect(() => InvitationRowSchema.parse(validInvite)).not.toThrow();
  });

  it("rejects invalid email", () => {
    expect(() => InvitationRowSchema.parse({ ...validInvite, email: "not-email" })).toThrow();
  });

  it("rejects owner role (cannot be granted via invite)", () => {
    expect(() => InvitationRowSchema.parse({ ...validInvite, role: "owner" })).toThrow();
  });

  it("rejects token with wrong length", () => {
    expect(() => InvitationRowSchema.parse({ ...validInvite, token: "short" })).toThrow();
  });

  it("parseInvitation returns typed object", () => {
    const i = parseInvitation(validInvite);
    expect(i.email).toBe("bob@example.com");
    expect(i.role).toBe("editor");
    expect(i.token).toHaveLength(64);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. AgentMessageRow — channel-specific
// ════════════════════════════════════════════════════════════════════════════

describe("AgentMessageRow Schema", () => {
  const validMsg = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    agent_id: "550e8400-e29b-41d4-a716-446655440001",
    session_id: "550e8400-e29b-41d4-a716-446655440002",
    role: "user" as const,
    content: "What does clause 7 say?",
    channel: "whatsapp" as const,
    external_user_id: "62812345678",
    citations: null,
    created_at: "2026-07-05T10:30:00.000Z",
  };

  it("accepts valid channel message", () => {
    expect(() => AgentMessageRowSchema.parse(validMsg)).not.toThrow();
  });

  it("accepts telegram channel messages", () => {
    expect(() =>
      AgentMessageRowSchema.parse({ ...validMsg, channel: "telegram" }),
    ).not.toThrow();
  });

  it("accepts null channel (playground)", () => {
    expect(() =>
      AgentMessageRowSchema.parse({ ...validMsg, channel: null }),
    ).not.toThrow();
  });

  it("rejects invalid channel", () => {
    expect(() =>
      AgentMessageRowSchema.parse({ ...validMsg, channel: "discord" }),
    ).toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Round-trip: Zod parse + JSON serialize (DB → app → response pipeline)
// ════════════════════════════════════════════════════════════════════════════

describe("Schema Round-Trip", () => {
  it("DocumentRow survives JSON.parse → parseDocument", () => {
    const raw = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "test.pdf",
      storage_path: "uploads/2026/x.pdf",
      binary_hash: "a".repeat(64),
      text_hash: "b".repeat(64),
      extracted_text: "hello world",
      file_size_bytes: 100,
      file_type: "text/plain",
      tenant_id: "550e8400-e29b-41d4-a716-446655440001",
      uploaded_by: "550e8400-e29b-41d4-a716-446655440002",
      created_at: "2026-07-05T10:30:00.000Z",
      description: null,
      notes: null,
      original_filename: null,
      deleted_at: null,
      deleted_by: null,
      fingerprint: null,
      chain: null,
      tx_hash: null,
      anchored_at: null,
    };
    // Simulate JSON round-trip (what happens when DB returns data)
    const serialized = JSON.parse(JSON.stringify(raw));
    const doc = parseDocument(serialized);
    expect(doc.id).toBe(raw.id);
    expect(doc.extracted_text).toBe("hello world");
    expect(doc.file_size_bytes).toBe(100);
  });

  it("TenantRow survives JSON.parse → parseTenant", () => {
    const raw = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Tenant",
      plan: "free",
      usage_documents: 5,
      usage_llm_calls: 10,
      usage_storage_bytes: 50000,
      usage_reset_at: null,
      created_at: "2026-07-05T10:30:00.000Z",
    };
    const serialized = JSON.parse(JSON.stringify(raw));
    const tenant = parseTenant(serialized);
    expect(tenant.name).toBe("Test Tenant");
    expect(tenant.plan).toBe("free");
  });
});
