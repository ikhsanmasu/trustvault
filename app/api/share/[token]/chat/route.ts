import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import {
  generateEmbedding,
  buildRAGPrompt,
  chatCompletionStream,
  extractCitations,
  ChatMessage as ChatMessageInput,
  RetrievalResult,
} from "@/lib/ai-assistant";
import type {
  ErrorResponse,
  PublicChatRequest,
  Citation,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 4000;
const MAX_RETRIEVED_CHUNKS = 5;
const MAX_HISTORY_MESSAGES = 10;

function isValidToken(token: string): boolean {
  return /^[0-9a-f]{32}$/i.test(token);
}

/**
 * Computes cosine similarity between two vectors of equal length.
 * Returns a value between -1 (opposite) and 1 (identical).
 */
function cosineSimilarity(a: number[], b: number[]): number {
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
function parseEmbedding(raw: unknown): number[] | null {
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

// ---------------------------------------------------------------------------
// POST /api/share/[token]/chat — PUBLIC chat (SSE streaming, NO AUTH)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse<ErrorResponse>> {
  const { token } = await params;

  // -- 1. Validate token format ---------------------------------------------
  if (!isValidToken(token)) {
    return NextResponse.json(
      { error: "Invalid share token format", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  // -- 2. Validate share (service client, no auth) --------------------------
  const serviceClient = createServiceClient();
  const { data: share, error: shareError } = await serviceClient
    .from("shared_links")
    .select("document_ids, is_active, allow_chat, expires_at, project_id")
    .eq("token", token)
    .single();

  if (shareError || !share) {
    return NextResponse.json(
      { error: "Share link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!share.is_active) {
    return NextResponse.json(
      { error: "This share link has been revoked", code: "GONE" },
      { status: 410 },
    );
  }

  const expiresAt = share.expires_at
    ? new Date(share.expires_at as string)
    : null;
  if (expiresAt && expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "This share link has expired", code: "GONE" },
      { status: 410 },
    );
  }

  if (!share.allow_chat) {
    return NextResponse.json(
      { error: "Chat is not enabled for this share link", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const sharedDocumentIds: string[] = (share.document_ids as string[]) ?? [];
  if (sharedDocumentIds.length === 0) {
    return NextResponse.json(
      { error: "No documents in this share to chat with", code: "NO_DOCUMENTS" },
      { status: 400 },
    );
  }

  // -- 3. Parse and validate body -------------------------------------------
  let body: PublicChatRequest;
  try {
    body = (await request.json()) as PublicChatRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { message, history } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "message is required", code: "MISSING_MESSAGE" },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `message must be at most ${MAX_MESSAGE_LENGTH} characters`,
        code: "MESSAGE_TOO_LONG",
      },
      { status: 400 },
    );
  }

  // Validate history if provided
  const chatHistory: ChatMessageInput[] = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-MAX_HISTORY_MESSAGES)) {
      if (
        h &&
        typeof h.role === "string" &&
        (h.role === "user" || h.role === "assistant") &&
        typeof h.content === "string"
      ) {
        chatHistory.push({ role: h.role, content: h.content });
      }
    }
  }

  // Capture for closure
  const capturedDocumentIds = sharedDocumentIds;
  const capturedMessage = message;
  const capturedHistory = chatHistory;

  // -- 4. Build and return SSE stream ---------------------------------------
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        // 4a. Generate embedding for the question
        const questionEmbedding = await generateEmbedding(capturedMessage);

        // 4b. Retrieve similar chunks ONLY from shared documents
        let scored: Array<{
          chunk_id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          similarity: number;
        }> = [];

        if (questionEmbedding) {
          const sClient = createServiceClient();
          const { data: allChunks, error: chunksError } = await sClient
            .from("document_chunks")
            .select("id, document_id, chunk_index, content, embedding")
            .in("document_id", capturedDocumentIds);

          if (!chunksError && allChunks) {
            scored = allChunks
              .map((chunk) => {
                const emb = parseEmbedding(chunk.embedding);
                if (!emb) return null;
                return {
                  chunk_id: chunk.id as string,
                  document_id: chunk.document_id as string,
                  chunk_index: chunk.chunk_index as number,
                  content: chunk.content as string,
                  similarity: cosineSimilarity(questionEmbedding, emb),
                };
              })
              .filter((s): s is NonNullable<typeof s> => s !== null)
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, MAX_RETRIEVED_CHUNKS);
          }
        }

        // 4c. Fetch document names for the retrieved chunks
        const uniqueDocIds = [...new Set(scored.map((c) => c.document_id))];
        const docNameMap = new Map<string, string>();
        if (uniqueDocIds.length > 0) {
          const sClient = createServiceClient();
          const { data: docs } = await sClient
            .from("documents")
            .select("id, name")
            .in("id", uniqueDocIds);

          for (const doc of docs ?? []) {
            docNameMap.set(doc.id as string, doc.name as string);
          }
        }

        // Add document names to scored results
        const retrievalResults: RetrievalResult[] = scored.map((s) => ({
          ...s,
          document_name: docNameMap.get(s.document_id) ?? "Unknown Document",
        }));

        // 4d. Build RAG prompt (with client-provided history, no DB persistence)
        const { system, user: userPrompt } = buildRAGPrompt(
          retrievalResults,
          capturedHistory,
          capturedMessage,
        );

        // 4e. Stream DeepSeek response via SSE
        await chatCompletionStream(system, userPrompt, {
          onToken: (t: string) => {
            send("token", { token: t });
          },
          onComplete: (fullResponse: string) => {
            // Extract citations from the response
            const citations: Citation[] = extractCitations(
              fullResponse,
              retrievalResults,
            );

            // Send citations event
            send("citations", { citations });

            // Send done event
            send("done", { complete: true });
            controller.close();
          },
          onError: (err: Error) => {
            send("error", {
              error: err.message,
              code: "AI_API_ERROR",
            });
            controller.close();
          },
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Internal server error";
        send("error", { error: errorMessage, code: "INTERNAL_ERROR" });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
