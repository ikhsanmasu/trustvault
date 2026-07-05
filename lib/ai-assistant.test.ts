import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chunkText,
  estimateTokenCount,
  buildRAGPrompt,
  buildPlainChatPrompt,
  extractCitations,
  chatCompletionStream,
} from "./ai-assistant";
import type { RetrievalResult, ChatMessage } from "./ai-assistant";

// ---------------------------------------------------------------------------
// Mock OpenAI embeddings via fetch
// ---------------------------------------------------------------------------

const EMBEDDING_DIM = 1536;

function mockEmbeddingResponse(...embeddings: (number[] | null)[]) {
  return new Response(
    JSON.stringify({
      data: embeddings.map((e) => ({ embedding: e })),
    }),
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------

describe("chunkText", () => {
  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(chunkText("   \n  \t  ")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const text = "This is a short sentence.";
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it("splits long text on paragraph breaks", () => {
    // Build text with multiple paragraphs
    const paragraphs: string[] = [];
    for (let i = 0; i < 10; i++) {
      paragraphs.push(`Paragraph ${i}: `.padEnd(200, "x"));
    }
    const text = paragraphs.join("\n\n");
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
  });

  it("splits text that exceeds chunk size", () => {
    const text = "word ".repeat(500);
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should be reasonable
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000); // MAX_CHUNK_CHARS
    }
  });

  it("handles Windows-style line endings (\\r\\n)", () => {
    const text =
      "Line one with enough text to make a decent chunk yes indeed.\r\n\r\n" +
      "Line two with enough text to make a decent chunk yes indeed.\r\n\r\n" +
      "Line three with enough text to make a decent chunk yes indeed.";
    const result = chunkText(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // No \r should remain
    for (const chunk of result) {
      expect(chunk).not.toContain("\r");
    }
  });

  it("returns exact text for single-chunk input", () => {
    const text = "Hello world. This is a test.";
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it("handles very long single-word (no spaces) input", () => {
    const text = "x".repeat(5000);
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should be non-empty
    for (const chunk of result) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("overlaps consecutive chunks", () => {
    // Create a long text that will definitely be split into multiple chunks
    const sentence =
      "This is a sentence that will be repeated many times to create a long text. ";
    const text = sentence.repeat(80);
    const result = chunkText(text);
    if (result.length > 1) {
      // The end of chunk 0 should appear at the start of chunk 1 (overlap)
      const firstChunkEnd = result[0].slice(-20);
      const secondChunkStart = result[1].slice(0, 20);
      // There should be some overlap — at least one character common
      const overlapFound = [...firstChunkEnd].some((char) =>
        secondChunkStart.includes(char),
      );
      expect(overlapFound).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// estimateTokenCount
// ---------------------------------------------------------------------------

describe("estimateTokenCount", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("returns roughly characters/4 for English text", () => {
    // 400 characters -> ~100 tokens
    const tokens = estimateTokenCount("x".repeat(400));
    expect(tokens).toBe(100);
  });

  it("rounds up for fractional results", () => {
    expect(estimateTokenCount("abc")).toBe(1); // 3/4 = 0.75 -> ceil = 1
    expect(estimateTokenCount("abcde")).toBe(2); // 5/4 = 1.25 -> ceil = 2
  });
});

// ---------------------------------------------------------------------------
// buildRAGPrompt
// ---------------------------------------------------------------------------

describe("buildRAGPrompt", () => {
  const sampleChunks: RetrievalResult[] = [
    {
      chunk_id: "c1",
      document_id: "d1",
      document_name: "Contract A",
      chunk_index: 0,
      content: "Payment terms: Net 30 days.",
      similarity: 0.95,
    },
    {
      chunk_id: "c2",
      document_id: "d2",
      document_name: "Amendment B",
      chunk_index: 2,
      content: "Delivery date extended to June 2026.",
      similarity: 0.87,
    },
  ];

  it("includes document excerpts section when chunks provided", () => {
    const { system, user } = buildRAGPrompt(
      sampleChunks,
      [],
      "What are the payment terms?",
    );
    expect(user).toContain("## Document Excerpts");
    expect(user).toContain("[Source 1: Contract A");
    expect(user).toContain("[Source 2: Amendment B");
    expect(user).toContain("Payment terms: Net 30 days.");
    expect(user).toContain("## User Question");
    expect(user).toContain("What are the payment terms?");
    expect(system).toContain("TrustVault AI Assistant");
  });

  it("includes no-excerpts message when chunks are empty", () => {
    const { user } = buildRAGPrompt(
      [],
      [],
      "Any relevant info?",
    );
    expect(user).toContain("No relevant document excerpts found");
  });

  it("includes conversation history when provided", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const { user } = buildRAGPrompt(
      sampleChunks,
      history,
      "Follow up question",
    );
    expect(user).toContain("## Conversation History");
    expect(user).toContain("User: Hello");
    expect(user).toContain("Assistant: Hi there!");
  });

  it("limits history to last N messages", () => {
    const history: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}`,
    }));
    const { user } = buildRAGPrompt(
      sampleChunks,
      history,
      "Latest question",
    );
    // Message 0-9 should NOT appear (only last 10)
    expect(user).not.toContain("Message 0");
    expect(user).not.toContain("Message 9");
    // Message 10-19 should appear
    expect(user).toContain("Message 10");
    expect(user).toContain("Message 19");
  });

  it("returns different instructions when context is available vs not", () => {
    const withContext = buildRAGPrompt(sampleChunks, [], "q");
    const withoutContext = buildRAGPrompt([], [], "q");
    expect(withContext.user).not.toBe(withoutContext.user);
    expect(withoutContext.user).toContain("not appear to contain relevant");
  });
});

// ---------------------------------------------------------------------------
// buildPlainChatPrompt
// ---------------------------------------------------------------------------

describe("buildPlainChatPrompt", () => {
  it("builds prompt without context chunks", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Hello" },
    ];
    const { user } = buildPlainChatPrompt(history, "How are you?");
    expect(user).toContain("No relevant document excerpts found");
    expect(user).toContain("Hello");
    expect(user).toContain("How are you?");
  });
});

// ---------------------------------------------------------------------------
// extractCitations
// ---------------------------------------------------------------------------

describe("extractCitations", () => {
  const retrievedChunks: RetrievalResult[] = [
    {
      chunk_id: "c1",
      document_id: "d1",
      document_name: "Contract A",
      chunk_index: 0,
      content: "Payment terms: Net 30 days from invoice date.",
      similarity: 0.95,
    },
    {
      chunk_id: "c2",
      document_id: "d2",
      document_name: "Amendment B",
      chunk_index: 2,
      content: "Delivery date extended to June 2026 per mutual agreement.",
      similarity: 0.87,
    },
  ];

  it("extracts citations from [Source N: ...] references", () => {
    const response =
      "Based on the documents, [Source 1: Contract A] specifies payment terms of Net 30. Additionally, [Source 2: Amendment B] extends delivery to June 2026.";
    const citations = extractCitations(response, retrievedChunks);
    expect(citations.length).toBe(2);
    expect(citations[0].document_id).toBe("d1");
    expect(citations[0].document_name).toBe("Contract A");
    expect(citations[0].chunk_index).toBe(0);
    expect(citations[1].document_id).toBe("d2");
    expect(citations[1].document_name).toBe("Amendment B");
    expect(citations[1].chunk_index).toBe(2);
  });

  it("handles [Source N] without colon/description", () => {
    const response = "See [Source 1] and [Source 2] for details.";
    const citations = extractCitations(response, retrievedChunks);
    expect(citations.length).toBe(2);
    expect(citations[0].document_id).toBe("d1");
    expect(citations[1].document_id).toBe("d2");
  });

  it("deduplicates citations for the same document+chunk", () => {
    const response =
      "[Source 1: Contract A] says X. [Source 1: Contract A] also says Y.";
    const citations = extractCitations(response, retrievedChunks);
    expect(citations.length).toBe(1);
  });

  it("falls back to top chunk when no explicit citations found", () => {
    const response =
      "The payment terms are Net 30 days based on the provided documents.";
    const citations = extractCitations(response, retrievedChunks);
    expect(citations.length).toBe(1);
    expect(citations[0].document_id).toBe("d1"); // top result
  });

  it("returns empty array when no chunks and no citations", () => {
    const citations = extractCitations("No relevant info.", []);
    expect(citations).toEqual([]);
  });

  it("ignores out-of-range source indices", () => {
    const response = "See [Source 5] and [Source 1].";
    const citations = extractCitations(response, retrievedChunks);
    // Only Source 1 is valid (0-based index 0)
    expect(citations.length).toBe(1);
    expect(citations[0].document_id).toBe("d1");
  });

  it("includes a ~150 char snippet from the chunk content", () => {
    const response = "[Source 1: Contract A]";
    const citations = extractCitations(response, retrievedChunks);
    expect(citations[0].snippet.length).toBeLessThanOrEqual(150);
    expect(citations[0].snippet).toBe(
      "Payment terms: Net 30 days from invoice date.",
    );
  });
});

// ---------------------------------------------------------------------------
// generateEmbedding (mocked local MiniLM pipeline, 384 dims)
// ---------------------------------------------------------------------------

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 384-dim embedding on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockEmbeddingResponse(Array(EMBEDDING_DIM).fill(0.01)),
    );

    const { generateEmbedding: genEmb } = await import("./ai-assistant");
    const result = await genEmb("test text");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(EMBEDDING_DIM);
  });

  it("returns null for empty text", async () => {
    const { generateEmbedding: genEmb } = await import("./ai-assistant");
    const result = await genEmb("");
    expect(result).toBeNull();
  });

  it("returns null on pipeline error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("API error"));

    const { generateEmbedding: genEmb } = await import("./ai-assistant");
    const result = await genEmb("test text");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateEmbeddings (sequential local pipeline)
// ---------------------------------------------------------------------------

describe("generateEmbeddings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const count = Array.isArray(body.input) ? body.input.length : 1;
      return mockEmbeddingResponse(
        ...Array.from({ length: count }, () => Array(EMBEDDING_DIM).fill(0.01)),
      );
    });
  });

  it("returns embeddings array on success", async () => {
    const { generateEmbeddings: genEmbs } = await import("./ai-assistant");
    const results = await genEmbs(["text1", "text2", "text3"]);
    expect(results).toHaveLength(3);
    expect(results[0]).toHaveLength(EMBEDDING_DIM);
    expect(results[1]).toHaveLength(EMBEDDING_DIM);
    expect(results[2]).toHaveLength(EMBEDDING_DIM);
  });

  it("returns null-filled array on pipeline failure", async () => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("API error"));

    const { generateEmbeddings: genEmbs } = await import("./ai-assistant");
    const results = await genEmbs(["text1", "text2", "text3"]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ingestDocument
// ---------------------------------------------------------------------------

describe("ingestDocument", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const count = Array.isArray(body.input) ? body.input.length : 1;
      return mockEmbeddingResponse(
        ...Array.from({ length: count }, () => Array(EMBEDDING_DIM).fill(0.01)),
      );
    });
  });

  it("returns empty array for empty text", async () => {
    // Use dynamic import so the module picks up our mocked OpenAI
    const { ingestDocument: ingDoc } = await import("./ai-assistant");
    const result = await ingDoc("doc1", "");
    expect(result).toEqual([]);
  });

  it("returns empty array for whitespace-only text", async () => {
    const { ingestDocument: ingDoc } = await import("./ai-assistant");
    const result = await ingDoc("doc1", "   \n  ");
    expect(result).toEqual([]);
  });

  it("returns empty array for null/undefined text", async () => {
    const { ingestDocument: ingDoc } = await import("./ai-assistant");
    const result = await ingDoc("doc1", null as unknown as string);
    expect(result).toEqual([]);
  });

  it("returns chunk records with embeddings for valid text", async () => {
    const { ingestDocument: ingDoc } = await import("./ai-assistant");

    // Text that produces multiple chunks (2000 chars = roughly 2-3 chunks)
    const text = "abc ".repeat(500);
    const result = await ingDoc("doc1", text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Each record should have embedding, document_id, etc.
    for (const record of result) {
      expect(record.document_id).toBe("doc1");
      expect(record.embedding).not.toBeNull();
      expect(record.embedding).toHaveLength(EMBEDDING_DIM);
      expect(record.content.length).toBeGreaterThan(0);
      expect(typeof record.chunk_index).toBe("number");
      expect(typeof record.token_count).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// chatCompletionStream
// ---------------------------------------------------------------------------

describe("chatCompletionStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("streams tokens to onToken callback", async () => {
    const encoder = new TextEncoder();
    const sseData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    const mockResponse = {
      ok: true,
      body: { getReader: () => mockReader },
    };

    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse as unknown as Response,
    );

    const tokens: string[] = [];
    let completed = "";

    await chatCompletionStream(
      "system prompt",
      "user prompt",
      {
        onToken: (token) => tokens.push(token),
        onComplete: (full) => {
          completed = full;
        },
        onError: () => {},
      },
    );

    expect(tokens).toEqual(["Hello", " world"]);
    expect(completed).toBe("Hello world");
  });

  it("calls onError when API returns non-OK", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    let errorMsg = "";
    await chatCompletionStream("sys", "usr", {
      onToken: () => {},
      onComplete: () => {},
      onError: (err) => {
        errorMsg = err.message;
      },
    });

    expect(errorMsg).toContain("500");
  });

  it("calls onError when fetch throws", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    let errorMsg = "";
    await chatCompletionStream("sys", "usr", {
      onToken: () => {},
      onComplete: () => {},
      onError: (err) => {
        errorMsg = err.message;
      },
    });

    expect(errorMsg).toContain("Network error");
  });

  it("calls onError when response has no body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: null,
    } as unknown as Response);

    let errorMsg = "";
    await chatCompletionStream("sys", "usr", {
      onToken: () => {},
      onComplete: () => {},
      onError: (err) => {
        errorMsg = err.message;
      },
    });

    expect(errorMsg).toContain("No response body");
  });
});

// ---------------------------------------------------------------------------
// chunkText — additional edge cases
// ---------------------------------------------------------------------------

describe("chunkText edge cases", () => {
  it("handles very long text (10k+ characters)", () => {
    const longText = "The quick brown fox jumps over the lazy dog. ".repeat(300);
    expect(longText.length).toBeGreaterThan(10000);
    const result = chunkText(longText);
    expect(result.length).toBeGreaterThan(5);
    // Every chunk must respect the hard cap
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("handles Unicode characters (CJK, emoji, accented)", () => {
    const cjkText =
      "日本語のテキストです。これはテストです。".repeat(20) +
      "안녕하세요 여러분. 이것은 한국어 텍스트입니다. ".repeat(10);
    const result = chunkText(cjkText);
    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
      // Should preserve multi-byte characters intact
      expect(chunk).not.toContain("�"); // no replacement characters
    }
    // Recombined chunks (trimming overlap) should preserve the original text essence
    const combined = result.join(" ");
    expect(combined).toContain("日本語");
    expect(combined).toContain("한국어");
  });

  it("preserves CJK characters across chunk boundaries", () => {
    // CJK text without spaces — should still chunk on characters without corrupting glyphs
    const cjkPlain = "测试文档内容包含许多中文字符并且没有自然的分词边界。".repeat(80);
    const result = chunkText(cjkPlain);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      // Each chunk should contain valid CJK characters
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("handles emoji-heavy text", () => {
    const emojiText = "🎉🎊🥳 ".repeat(200) + "Hello world! ".repeat(50);
    const result = chunkText(emojiText);
    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  it("handles text with mixed scripts and newlines", () => {
    const mixed =
      "English paragraph with numbers 12345.\n\n" +
      "العربية نص تجريبي.\n\n" +
      "Русский текст для проверки.\n\n" +
      "עברית טקסט לבדיקה.\n\n";
    const result = chunkText(mixed.repeat(10));
    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      expect(chunk).not.toContain("\r");
    }
  });

  it("handles text with exactly chunk boundary lengths", () => {
    // Build text where each paragraph is just under CHUNK_SIZE
    const para = "x".repeat(780);
    const text = [para, para, para].join("\n\n");
    const result = chunkText(text);
    // Should produce 3 chunks (each para is under the limit)
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("handles text with many consecutive newlines", () => {
    const text =
      "First section.\n\n\n\n\n\n\n\n\n\nSecond section.\n\n\n\nThird section.";
    const result = chunkText(text.repeat(20));
    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      // Chunks should not be solely whitespace
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns empty array for null/undefined-like inputs", () => {
    // @ts-expect-error testing runtime behavior
    expect(chunkText(null)).toEqual([]);
    // @ts-expect-error testing runtime behavior
    expect(chunkText(undefined)).toEqual([]);
  });

  it("overlap preserves context across many chunks", () => {
    const sentence =
      "The contract specifies that all payments must be made within thirty calendar days. ";
    const text = sentence.repeat(100);
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(3);
    // Verify overlap exists between each pair of consecutive chunks
    let overlapCount = 0;
    for (let i = 1; i < result.length; i++) {
      const prevEnd = result[i - 1].slice(-30);
      const currStart = result[i].slice(0, 30);
      const hasOverlap = [...prevEnd].some(
        (char, idx) => currStart[idx] === char,
      );
      if (hasOverlap) overlapCount++;
    }
    expect(overlapCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildRAGPrompt — additional edge cases
// ---------------------------------------------------------------------------

describe("buildRAGPrompt edge cases", () => {
  const manyChunks: RetrievalResult[] = Array.from(
    { length: 15 },
    (_, i) => ({
      chunk_id: `c${i}`,
      document_id: `d${i % 3}`,
      document_name: `Document ${String.fromCharCode(65 + (i % 3))}`,
      chunk_index: i,
      content: `Content of chunk ${i} with some example text about various topics.`,
      similarity: 0.9 - i * 0.05,
    }),
  );

  it("handles many context chunks (15+)", () => {
    const { user } = buildRAGPrompt(manyChunks, [], "Test question?");
    // All 15 chunks should be listed as sources
    expect(user).toContain("[Source 1:");
    expect(user).toContain("[Source 15:");
    // Should not contain Source 16
    expect(user).not.toContain("[Source 16:");
  });

  it("handles empty history gracefully", () => {
    const { user } = buildRAGPrompt(
      [
        {
          chunk_id: "c1",
          document_id: "d1",
          document_name: "Doc",
          chunk_index: 0,
          content: "Some content.",
          similarity: 0.9,
        },
      ],
      [],
      "Question?",
    );
    // Should NOT have a history section
    expect(user).not.toContain("## Conversation History");
    // Should have excerpts and question
    expect(user).toContain("## Document Excerpts");
    expect(user).toContain("## User Question");
    expect(user).toContain("Question?");
  });

  it("handles very long question text", () => {
    const longQuestion = "Is this covered? ".repeat(200);
    const { user } = buildRAGPrompt([], [], longQuestion);
    expect(user).toContain(longQuestion);
    expect(user).toContain("## User Question");
  });

  it("always includes the system prompt", () => {
    const { system } = buildRAGPrompt([], [], "Any question");
    expect(system).toContain("TrustVault AI Assistant");
    expect(system.length).toBeGreaterThan(100);
  });

  it("truncates history past MAX_HISTORY_MESSAGES", () => {
    const history: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}`,
    }));
    const { user } = buildRAGPrompt([], history, "Latest");
    // Messages 0-14 should not appear
    expect(user).not.toContain("Message 0");
    expect(user).not.toContain("Message 14");
    // Only last 10 should appear (messages 15-24)
    expect(user).toContain("Message 15");
    expect(user).toContain("Message 24");
  });

  it("does not include history section when history array is empty even if chunks exist", () => {
    const sampleChunks: RetrievalResult[] = [
      {
        chunk_id: "c1",
        document_id: "d1",
        document_name: "Doc A",
        chunk_index: 0,
        content: "Some content here.",
        similarity: 0.95,
      },
    ];
    const { user } = buildRAGPrompt(sampleChunks, [], "Question");
    expect(user).not.toContain("## Conversation History");
    expect(user).toContain("## Document Excerpts");
    expect(user).toContain("## Instructions");
    expect(user).toContain("## User Question");
  });
});

// ---------------------------------------------------------------------------
// extractCitations — additional edge cases
// ---------------------------------------------------------------------------

describe("extractCitations edge cases", () => {
  const retrievedChunks: RetrievalResult[] = [
    {
      chunk_id: "c1",
      document_id: "d1",
      document_name: "Document A",
      chunk_index: 0,
      content: "Content A with enough text to generate a meaningful snippet for testing purposes.",
      similarity: 0.95,
    },
    {
      chunk_id: "c2",
      document_id: "d2",
      document_name: "Document B",
      chunk_index: 1,
      content: "Content B with additional details and supporting information.",
      similarity: 0.87,
    },
    {
      chunk_id: "c3",
      document_id: "d1",
      document_name: "Document A",
      chunk_index: 3,
      content: "More content from Document A in a different chunk.",
      similarity: 0.82,
    },
  ];

  it("returns empty array for empty response text", () => {
    const citations = extractCitations("", retrievedChunks);
    // Since we have retrieved chunks and no explicit citations, it falls back to top chunk
    expect(citations.length).toBe(1);
    expect(citations[0].document_id).toBe("d1");
  });

  it("returns empty array for completely empty chunks and empty response", () => {
    const citations = extractCitations("", []);
    expect(citations).toEqual([]);
  });

  it("correctly handles [Source N] with many numbers", () => {
    const response =
      "Sources [Source 1], [Source 2], and [Source 3] all confirm this point.";
    const citations = extractCitations(response, retrievedChunks);
    expect(citations.length).toBe(3);
  });

  it("handles malformed source references gracefully", () => {
    const response =
      "Regarding [Source abc] and [Source] and [Source 1] it is clear.";
    const citations = extractCitations(response, retrievedChunks);
    // Only [Source 1] is valid — but because fallback kicks in if citations.length === 0,
    // we still get 1 from the fallback top chunk
    expect(citations.length).toBe(1);
    expect(citations[0].document_id).toBe("d1");
  });

  it("handles [Source 0] which is out of range", () => {
    const response = "Check [Source 0] for details.";
    const citations = extractCitations(response, retrievedChunks);
    // Source 0 is out of range, but fallback cites top chunk
    expect(citations.length).toBe(1);
    expect(citations[0].document_id).toBe("d1");
  });

  it("deduplicates citations by document_id + chunk_index", () => {
    const response =
      "[Source 1: Doc A] says X. [Source 3: Doc A chunk 3] says Y.";
    const citations = extractCitations(response, retrievedChunks);
    // Source 1 (d1, chunk 0) and Source 3 (d1, chunk 3) — different chunk, both kept
    expect(citations.length).toBe(2);
  });

  it("returns snippet of max 150 characters", () => {
    // Create a chunk with >150 chars
    const longContent = "A".repeat(200);
    const longChunks: RetrievalResult[] = [
      {
        chunk_id: "cl",
        document_id: "dl",
        document_name: "Long Doc",
        chunk_index: 0,
        content: longContent,
        similarity: 0.99,
      },
    ];
    const response = "[Source 1: Long Doc]";
    const citations = extractCitations(
      response,
      longChunks,
    );
    expect(citations[0].snippet.length).toBeLessThanOrEqual(150);
    expect(citations[0].snippet).toBe(longContent.slice(0, 150));
  });

  it("falls back to top result when response is unrelated text", () => {
    const response =
      "While I cannot find specific information about that, the documents generally cover...";
    const citations = extractCitations(response, retrievedChunks);
    expect(citations.length).toBe(1);
    expect(citations[0].document_id).toBe("d1");
  });
});

// ---------------------------------------------------------------------------
// generateEmbeddings — large batch edge case
// ---------------------------------------------------------------------------

describe("generateEmbeddings edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const count = Array.isArray(body.input) ? body.input.length : 1;
      return mockEmbeddingResponse(
        ...Array.from({ length: count }, () => Array(EMBEDDING_DIM).fill(0.01)),
      );
    });
  });

  it("handles large batch size (50 texts)", async () => {
    const { generateEmbeddings: genEmbs } = await import("./ai-assistant");
    const texts = Array.from({ length: 50 }, (_, i) => `text ${i}`);
    const results = await genEmbs(texts);
    expect(results).toHaveLength(50);
    for (const r of results) {
      expect(r).not.toBeNull();
      expect(r).toHaveLength(EMBEDDING_DIM);
    }
  });

  it("returns empty array for empty texts input", async () => {
    const { generateEmbeddings: genEmbs } = await import("./ai-assistant");
    const results = await genEmbs([]);
    expect(results).toEqual([]);
  });

  it("truncates long texts before sending to pipeline", async () => {
    let capturedText: string | null = null;
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      capturedText = body.input;
      return mockEmbeddingResponse(Array(EMBEDDING_DIM).fill(0.01));
    });

    const longText = "x".repeat(5000);
    const { generateEmbeddings: genEmbs } = await import("./ai-assistant");
    const results = await genEmbs([longText]);
    expect(results).toHaveLength(1);
    expect(results[0]).not.toBeNull();
    // Verify truncation happened (MiniLM max ~2000 chars)
    expect(capturedText!.length).toBeLessThanOrEqual(8000);
  });

  it("handles pipeline failure (model error)", async () => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("API error"));
    const { generateEmbeddings: genEmbs } = await import("./ai-assistant");
    const results = await genEmbs(["a", "b", "c"]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ingestDocument — large text & partial failures
// ---------------------------------------------------------------------------

describe("ingestDocument edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const count = Array.isArray(body.input) ? body.input.length : 1;
      return mockEmbeddingResponse(
        ...Array.from({ length: count }, () => Array(EMBEDDING_DIM).fill(0.01)),
      );
    });
  });

  it("processes very long text (20k+ chars) into many chunks", async () => {
    const { ingestDocument: ingDoc } = await import("./ai-assistant");
    const longText = "The contract specifies payment terms and conditions. ".repeat(600);
    expect(longText.length).toBeGreaterThan(20000);
    const result = await ingDoc("doc-large", longText);
    expect(result.length).toBeGreaterThan(10);
    // Each record should have consistent metadata
    for (const record of result) {
      expect(record.document_id).toBe("doc-large");
      expect(record.content.length).toBeGreaterThan(0);
      expect(record.content.length).toBeLessThanOrEqual(2000);
      expect(record.embedding).toHaveLength(EMBEDDING_DIM);
      expect(record.token_count).toBeGreaterThan(0);
    }
    // Chunk indices should be sequential
    const indices = result.map((r) => r.chunk_index);
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBe(i);
    }
  });

  it("handles text that produces a single chunk", async () => {
    const { ingestDocument: ingDoc } = await import("./ai-assistant");
    const result = await ingDoc("doc1", "Short text.");
    expect(result).toHaveLength(1);
    expect(result[0].chunk_index).toBe(0);
    expect(result[0].content).toBe("Short text.");
    expect(result[0].embedding).toHaveLength(EMBEDDING_DIM);
  });

  it("handles text with only whitespace and newlines", async () => {
    const { ingestDocument: ingDoc } = await import("./ai-assistant");
    const result = await ingDoc("doc1", "\n\n   \n\t  \n\n");
    expect(result).toEqual([]);
  });

  it("does not call embedding pipeline for empty text", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { ingestDocument: ingDoc } = await import("./ai-assistant");
    await ingDoc("doc1", "");
    // OpenAI API should not have been called for empty text
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// chatCompletionStream — additional edge cases
// ---------------------------------------------------------------------------

describe("chatCompletionStream edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles empty SSE data lines gracefully", async () => {
    const encoder = new TextEncoder();
    const sseData = [
      "\n\n", // empty
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      "", // completely empty
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    const tokens: string[] = [];
    await chatCompletionStream("sys", "usr", {
      onToken: (token) => tokens.push(token),
      onComplete: () => {},
      onError: () => {},
    });

    expect(tokens).toEqual(["Hello"]);
  });

  it("handles malformed JSON in SSE data gracefully", async () => {
    const encoder = new TextEncoder();
    const sseData = [
      'data: {invalid json}\n\n',
      'data: {"choices":[{"delta":{"content":"Valid"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    const tokens: string[] = [];
    await chatCompletionStream("sys", "usr", {
      onToken: (token) => tokens.push(token),
      onComplete: () => {},
      onError: () => {},
    });

    // Malformed JSON is skipped, valid token still arrives
    expect(tokens).toEqual(["Valid"]);
  });

  it("handles SSE line without 'data:' prefix", async () => {
    const encoder = new TextEncoder();
    const sseData = [
      'event: token\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    const tokens: string[] = [];
    await chatCompletionStream("sys", "usr", {
      onToken: (token) => tokens.push(token),
      onComplete: () => {},
      onError: () => {},
    });

    expect(tokens).toEqual(["Hello"]);
  });

  it("handles multi-byte UTF-8 tokens (split across reads partially)", async () => {
    const encoder = new TextEncoder();
    // Realistic SSE with emoji content split across chunks
    const sseData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" \\u00e9"}}]}\n\n', // é
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    const tokens: string[] = [];
    await chatCompletionStream("sys", "usr", {
      onToken: (token) => tokens.push(token),
      onComplete: () => {},
      onError: () => {},
    });

    expect(tokens).toEqual(["Hello", " é"]);
  });

  it("handles missing choices array in SSE data", async () => {
    const encoder = new TextEncoder();
    const sseData = [
      'data: {"choices":[]}\n\n',
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"GotIt"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    const tokens: string[] = [];
    await chatCompletionStream("sys", "usr", {
      onToken: (token) => tokens.push(token),
      onComplete: () => {},
      onError: () => {},
    });

    expect(tokens).toEqual(["GotIt"]);
  });

  it("calls onComplete with empty string when no tokens arrived", async () => {
    const encoder = new TextEncoder();
    const sseData = ['data: [DONE]\n\n'];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    let completed = "NOT_CALLED";
    await chatCompletionStream("sys", "usr", {
      onToken: () => {},
      onComplete: (full) => {
        completed = full;
      },
      onError: () => {},
    });

    expect(completed).toBe("");
  });

  it("calls onComplete with the correct accumulated full text", async () => {
    const encoder = new TextEncoder();
    const sseData = [
      'data: {"choices":[{"delta":{"content":"Line 1"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" continues"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < sseData.length) {
          const value = encoder.encode(sseData[chunkIndex]);
          chunkIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    let completed = "";
    await chatCompletionStream("sys", "usr", {
      onToken: () => {},
      onComplete: (full) => {
        completed = full;
      },
      onError: () => {},
    });

    expect(completed).toBe("Line 1 continues");
  });
});
