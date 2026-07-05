// ---------------------------------------------------------------------------
// TrustVault P6 — AI Vault Assistant (RAG pipeline)
// ---------------------------------------------------------------------------
// Chunking, OpenAI embedding (text-embedding-3-small, 1536 dims), RAG prompt
// construction, and DeepSeek chat completion.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Target characters per chunk. Chunks may be slightly larger to avoid
 *  splitting mid-sentence when possible. */
const CHUNK_SIZE = 800;

/** Characters of overlap between consecutive chunks. */
const CHUNK_OVERLAP = 100;

/** Maximum characters per document text sent to embedding API (per chunk). */
const MAX_CHUNK_CHARS = 2000;

/** Number of recent messages to include as conversation history in the prompt. */
const MAX_HISTORY_MESSAGES = 10;

/** OpenAI embedding model — fast, cheap, 1536 dims. */
const EMBEDDING_MODEL = "text-embedding-3-small";

/** OpenAI API base URL. */
const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** DeepSeek chat model (consistent with P1-P5). */
const CHAT_MODEL = "deepseek-chat";

/** Expected embedding dimension. */
// EMBEDDING_DIM removed (unused)

/** System prompt for the AI assistant. */
const ASSISTANT_SYSTEM_PROMPT = `You are TrustVault AI Assistant, a document-integrity and knowledge assistant.
You answer questions based on the document excerpts provided to you.
When you use information from the excerpts, cite which document the information came from.
If the answer cannot be found in the provided excerpts, say so honestly — do not fabricate information.
Keep your answers concise and professional.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Citation {
  document_id: string;
  document_name: string;
  chunk_index: number;
  snippet: string;
}

export interface RetrievalResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  similarity: number; // cosine similarity (1 = identical, -1 = opposite)
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getOpenAIKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
}

// ---------------------------------------------------------------------------
// Text Chunking
// ---------------------------------------------------------------------------

/**
 * Separators used for recursive text splitting, in priority order.
 * The splitter tries the first separator; if chunks are still too large,
 * it falls back to the next separator.
 */
const SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "];

/**
 * Splits `text` into overlapping chunks suitable for embedding and RAG.
 *
 * Uses recursive character splitting: tries to split on paragraph breaks
 * first, then newlines, then sentences, then words.
 *
 * Each chunk targets `CHUNK_SIZE` characters with `CHUNK_OVERLAP` overlap.
 * Chunks are never larger than `MAX_CHUNK_CHARS` (hard cap).
 *
 * Returns an empty array for empty/whitespace-only text.
 */
export function chunkText(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const chunks = splitRecursive(cleaned, SEPARATORS, 0);

  // Add overlap between consecutive chunks
  return addOverlap(chunks, CHUNK_OVERLAP);
}

/**
 * Recursively splits text using separators in priority order.
 */
function splitRecursive(
  text: string,
  separators: string[],
  separatorIndex: number,
): string[] {
  if (separatorIndex >= separators.length) {
    // Last resort: split by fixed length
    return splitByLength(text, CHUNK_SIZE);
  }

  const separator = separators[separatorIndex];
  const parts = text.split(separator);

  const result: string[] = [];
  let currentChunk = "";

  for (const part of parts) {
    const candidate = currentChunk
      ? currentChunk + separator + part
      : part;

    if (candidate.length <= CHUNK_SIZE) {
      currentChunk = candidate;
    } else {
      // Save current chunk if non-empty
      if (currentChunk.length > 0) {
        result.push(currentChunk.trim());
      }

      // If the candidate alone is still too large, recurse with next separator
      if (part.length > CHUNK_SIZE && separatorIndex + 1 < separators.length) {
        const subChunks = splitRecursive(part, separators, separatorIndex + 1);
        // The last sub-chunk becomes the new currentChunk (may merge with next part)
        if (subChunks.length > 0) {
          const last = subChunks.pop()!;
          for (const sc of subChunks) {
            result.push(sc.trim());
          }
          currentChunk = last;
        } else {
          currentChunk = "";
        }
      } else if (part.length > CHUNK_SIZE) {
        // No more separators — force split by length
        const forced = splitByLength(part, CHUNK_SIZE);
        if (forced.length > 0) {
          const last = forced.pop()!;
          for (const fc of forced) {
            result.push(fc.trim());
          }
          currentChunk = last;
        } else {
          currentChunk = "";
        }
      } else {
        currentChunk = part;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    result.push(currentChunk.trim());
  }

  return result;
}

/**
 * Splits text into fixed-length chunks at the nearest space boundary.
 */
function splitByLength(text: string, targetLength: number): string[] {
  const result: string[] = [];
  let remaining = text;

  while (remaining.length > targetLength) {
    let splitAt = targetLength;
    // Walk back to find a space
    while (splitAt > targetLength * 0.5 && remaining[splitAt] !== " ") {
      splitAt--;
    }
    if (remaining[splitAt] !== " ") {
      // No good split point — force at targetLength
      splitAt = targetLength;
    }
    result.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    result.push(remaining);
  }

  return result;
}

/**
 * Adds overlap text from the previous chunk to the start of each chunk
 * (after the first). Creates context continuity across chunk boundaries.
 */
function addOverlap(chunks: string[], overlap: number): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const current = chunks[i];

    if (prev.length > overlap) {
      const overlapText = prev.slice(-overlap);
      result.push(overlapText + "\n" + current);
    } else {
      result.push(current);
    }
  }

  return result;
}

/**
 * Estimates the token count for a string using a simple heuristic:
 * ~4 characters per token for English text. Good enough for chunk
 * sizing decisions; the embedding API has its own tokenizer.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Embedding Generation (OpenAI text-embedding-3-small, 1536 dims)
// ---------------------------------------------------------------------------

export async function generateEmbedding(
  text: string,
): Promise<number[] | null> {
  try {
    if (!text || text.trim().length === 0) return null;
    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAIKey()}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });
    if (!response.ok) {
      console.error(`[ai-assistant] OpenAI embeddings error: ${response.status}`);
      return null;
    }
    const data = (await response.json()) as { data?: { embedding?: number[] }[] };
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("[ai-assistant] OpenAI embedding error:", err);
    return null;
  }
}

export async function generateEmbeddings(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  try {
    const truncated = texts.map((t) => t.slice(0, 8000));
    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAIKey()}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: truncated }),
    });
    if (!response.ok) {
      console.error(`[ai-assistant] OpenAI batch error: ${response.status}`);
      return texts.map(() => null);
    }
    const data = (await response.json()) as { data?: { embedding?: number[] }[] };
    return data.data?.map((d) => d.embedding ?? null) ?? texts.map(() => null);
  } catch {
    return texts.map(() => null);
  }
}

// ---------------------------------------------------------------------------
// RAG Prompt Construction
// ---------------------------------------------------------------------------

/**
 * Builds the system + user prompts for the DeepSeek chat call with RAG context.
 *
 * @param contextChunks - Retrieved document chunks with document names
 * @param history - Recent conversation messages (max 10)
 * @param question - Current user question
 */
export function buildRAGPrompt(
  contextChunks: RetrievalResult[],
  history: ChatMessage[],
  question: string,
): { system: string; user: string } {
  // Build context section
  let contextBlock = "";
  if (contextChunks.length > 0) {
    const entries = contextChunks.map(
      (c, i) =>
        `[Source ${i + 1}: ${c.document_name} (chunk ${c.chunk_index})]\n${c.content}`,
    );
    contextBlock =
      "## Document Excerpts\n\n" + entries.join("\n\n") + "\n\n";
  } else {
    contextBlock =
      "## Document Excerpts\n\n(No relevant document excerpts found for this query. Answer based on your general knowledge but note that the answer may not reflect the actual documents in the vault.)\n\n";
  }

  // Build history section (last N messages)
  let historyBlock = "";
  if (history.length > 0) {
    const recent = history.slice(-MAX_HISTORY_MESSAGES);
    historyBlock =
      "## Conversation History\n\n" +
      recent
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n") +
      "\n\n";
  }

  // Build instructions based on whether we have context
  const instructions = contextChunks.length > 0
    ? "Answer the user's question based on the document excerpts above. When you reference information from an excerpt, mention which source document and chunk it came from. If the excerpts don't contain enough information, say so honestly."
    : "The user's project has no ingested documents or no relevant excerpts were found. Answer the question as best you can, but let the user know that the vault does not appear to contain relevant information on this topic.";

  const userPrompt =
    contextBlock +
    historyBlock +
    `## Instructions\n\n${instructions}\n\n` +
    `## User Question\n\n${question}`;

  return {
    system: ASSISTANT_SYSTEM_PROMPT,
    user: userPrompt,
  };
}

/**
 * Builds a standalone user prompt for a plain chat (no RAG context).
 * Used when no chunks are available.
 */
export function buildPlainChatPrompt(
  history: ChatMessage[],
  question: string,
): { system: string; user: string } {
  return buildRAGPrompt([], history, question);
}

// ---------------------------------------------------------------------------
// Citation Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts citations from the assistant's response by looking for source
 * references like "[Source 1: ...]" and mapping them back to retrieval results.
 */
export function extractCitations(
  assistantResponse: string,
  retrievedChunks: RetrievalResult[],
): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  // Look for explicit source references: [Source N: ...] or [Source N]
  const sourceRegex = /\[Source (\d+)(?::\s*([^\]]+))?\]/g;
  let match: RegExpExecArray | null;

  while ((match = sourceRegex.exec(assistantResponse)) !== null) {
    const sourceIndex = parseInt(match[1], 10) - 1; // 1-based to 0-based
    if (sourceIndex >= 0 && sourceIndex < retrievedChunks.length) {
      const chunk = retrievedChunks[sourceIndex];
      const key = `${chunk.document_id}:${chunk.chunk_index}`;
      if (!seen.has(key)) {
        seen.add(key);
        citations.push({
          document_id: chunk.document_id,
          document_name: chunk.document_name,
          chunk_index: chunk.chunk_index,
          snippet: chunk.content.slice(0, 150),
        });
      }
    }
  }

  // If no explicit citations found but we have chunks, cite the most relevant one
  if (citations.length === 0 && retrievedChunks.length > 0) {
    const top = retrievedChunks[0];
    citations.push({
      document_id: top.document_id,
      document_name: top.document_name,
      chunk_index: top.chunk_index,
      snippet: top.content.slice(0, 150),
    });
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Chat Completion (DeepSeek) — Non-streaming
// ---------------------------------------------------------------------------

/**
 * Calls DeepSeek chat/completions (non-streaming) and returns the full
 * response content. Used when we need the complete response for citation
 * extraction before sending to the client.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error(
        `[ai-assistant] DeepSeek API error: ${response.status}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.error("[ai-assistant] DeepSeek API call failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat Completion (DeepSeek) — Streaming with ReadableStream
// ---------------------------------------------------------------------------

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

/**
 * Calls DeepSeek chat/completions with `stream: true` and invokes callbacks
 * for each token, on completion, and on error.
 *
 * Returns a promise that resolves when the stream is fully consumed.
 */
export async function chatCompletionStream(
  systemPrompt: string,
  userPrompt: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      callbacks.onError(
        new Error(`DeepSeek API returned ${response.status}`),
      );
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error("No response body"));
      return;
    }

    const decoder = new TextDecoder();
    let fullResponse = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            fullResponse += token;
            callbacks.onToken(token);
          }
        } catch {
          // Skip unparseable SSE data
        }
      }
    }

    // Flush any remaining data in the decoder
    const remaining = decoder.decode();
    buffer += remaining;
    if (buffer.trim()) {
      // Process any remaining SSE lines
      const lines = buffer.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            fullResponse += token;
            callbacks.onToken(token);
          }
        } catch {
          // skip
        }
      }
    }

    callbacks.onComplete(fullResponse);
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

// ---------------------------------------------------------------------------
// Ingest Helper — processes a single document's text into chunk records
// ---------------------------------------------------------------------------

export interface ChunkRecord {
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  token_count: number;
}

/**
 * Processes extracted text into chunk records ready for DB insertion.
 * Chunks the text, generates embeddings, and returns the records.
 *
 * @param documentId - UUID of the source document
 * @param extractedText - Full extracted text from the document
 * @returns Array of chunk records (embedding may be null if generation failed)
 */
export async function ingestDocument(
  documentId: string,
  extractedText: string,
): Promise<ChunkRecord[]> {
  if (!extractedText || extractedText.trim().length === 0) {
    return [];
  }

  const chunks = chunkText(extractedText);
  if (chunks.length === 0) return [];

  // Generate embeddings in batches of 20 for efficiency
  const BATCH_SIZE = 20;
  const records: ChunkRecord[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch);

    for (let j = 0; j < batch.length; j++) {
      records.push({
        document_id: documentId,
        chunk_index: i + j,
        content: batch[j].slice(0, MAX_CHUNK_CHARS),
        embedding: embeddings[j],
        token_count: estimateTokenCount(batch[j]),
      });
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Shared ML helpers (used by assistant/chat and share/chat)
// ---------------------------------------------------------------------------

/**
 * Computes cosine similarity between two vectors of equal length.
 * Returns a value between -1 (opposite) and 1 (identical).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
}

/**
 * Parses an embedding value from the DB (may be string or array) into a
 * number[] or null.
 */
export function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  }
  return null;
}
