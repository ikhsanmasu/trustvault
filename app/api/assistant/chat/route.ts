import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole, getUserTenantId } from "@/lib/supabase/auth";
import {
  generateEmbedding,
  buildRAGPrompt,
  chatCompletionStream,
  extractCitations,
  ChatMessage as ChatMessageInput,
} from "@/lib/ai-assistant";
import { checkLLMLimit, incrementUsage } from "@/lib/rate-limit";
import type {
  ErrorResponse,
  Citation,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_MESSAGE_LENGTH = 4000;
const MAX_RETRIEVED_CHUNKS = 5;

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
// POST /api/assistant/chat (SSE streaming)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 1a. P17: Check LLM call limit for the user's tenant ------------------
  const tenantId = await getUserTenantId(supabase, user.id);
  if (tenantId) {
    const llmCheck = await checkLLMLimit(supabase, tenantId);
    if (!llmCheck.allowed) {
      return NextResponse.json(
        { error: llmCheck.reason ?? "LLM call limit reached", code: "PLAN_LIMIT_REACHED" },
        { status: 403 },
      );
    }
  }

  // -- 2. Parse & validate body ---------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "MISSING_PROJECT_ID" },
      { status: 400 },
    );
  }

  const sessionId = body.sessionId as string | undefined;
  const projectId = body.projectId as string | undefined;
  const message = body.message as string | undefined;
  const documentIds = body.documentIds as string[] | undefined;
  const customPrompt = body.customPrompt as string | undefined;

  // Type-check optional documentIds array
  const docIdList: string[] | undefined =
    Array.isArray(documentIds) && documentIds.every((id: unknown) => typeof id === "string")
      ? documentIds
      : undefined;

  // Type-check optional customPrompt
  const customSystemPrompt: string | undefined =
    typeof customPrompt === "string" && customPrompt.trim().length > 0
      ? customPrompt.trim()
      : undefined;

  // Validate message
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

  // Validate sessionId if provided
  if (sessionId !== undefined && sessionId !== null) {
    if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
      return NextResponse.json(
        {
          error: `sessionId must be a valid UUID`,
          code: "SESSION_NOT_FOUND",
        },
        { status: 404 },
      );
    }
  }

  // -- 3. Verify project membership (if projectId provided) ------------------
  if (projectId) {
    const roleCheck = await requireProjectRole(supabase, user.id, projectId, [
      "admin", "editor", "viewer",
    ]);
    if (!roleCheck.ok) return roleCheck.response;
  }

  // -- 4. Resolve/create session --------------------------------------------
  let resolvedSessionId: string;

  if (sessionId) {
    // Fetch existing session, verify ownership
    const { data: existingSession, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("id, project_id, user_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !existingSession) {
      return NextResponse.json(
        {
          error: `Session not found: ${sessionId}`,
          code: "SESSION_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    // Verify session belongs to this user (RLS handles this, but double-check)
    if ((existingSession.user_id as string) !== user.id) {
      return NextResponse.json(
        {
          error: `Session not found: ${sessionId}`,
          code: "SESSION_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    resolvedSessionId = sessionId;
  } else {
    // Create new session
    const title = message.slice(0, 100);
    const { data: newSession, error: createError } = await supabase
      .from("chat_sessions")
      .insert({
        project_id: projectId,
        user_id: user.id,
        title,
      })
      .select("id")
      .single();

    if (createError || !newSession) {
      return NextResponse.json(
        {
          error: "Failed to create chat session",
          code: "DB_ERROR",
        },
        { status: 500 },
      );
    }

    resolvedSessionId = newSession.id as string;
  }

  // -- 5. Insert user message -----------------------------------------------
  const { data: userMessage, error: msgError } = await supabase
    .from("chat_messages")
    .insert({
      session_id: resolvedSessionId,
      role: "user",
      content: message,
    })
    .select("id")
    .single();

  if (msgError || !userMessage) {
    return NextResponse.json(
      { error: "Failed to save message", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 6. Capture state for the streaming closure ---------------------------
  const capturedSessionId = resolvedSessionId;
  const capturedProjectId = projectId;

  // -- 7. Build and return SSE stream ---------------------------------------
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        // 7a. Generate embedding for the question
        const questionEmbedding = await generateEmbedding(message);

        // 7b. Retrieve similar chunks (degraded mode: skip if embedding failed)
        let scored: Array<{
          chunk_id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          similarity: number;
        }> = [];

        if (questionEmbedding) {
          let chunkQuery = supabase
            .from("document_chunks")
            .select("id, document_id, chunk_index, content, embedding");

          if (docIdList && docIdList.length > 0) {
            // Filter to only chunks from selected knowledge-base documents
            chunkQuery = chunkQuery.in("document_id", docIdList);
          } else if (capturedProjectId) {
            chunkQuery = chunkQuery.eq("project_id", capturedProjectId);
          }
          // If neither documentIds nor projectId, RLS + tenant scoping handles access

          const { data: allChunks, error: chunksError } = await chunkQuery;

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

        // 7d. Fetch document names for the retrieved chunks
        const uniqueDocIds = [...new Set(scored.map((c) => c.document_id))];
        const docNameMap = new Map<string, string>();
        if (uniqueDocIds.length > 0) {
          const { data: docs } = await supabase
            .from("documents")
            .select("id, name")
            .in("id", uniqueDocIds);

          for (const doc of docs ?? []) {
            docNameMap.set(doc.id as string, doc.name as string);
          }
        }

        // Add document names to scored results
        const retrievalResults = scored.map((s) => ({
          ...s,
          document_name: docNameMap.get(s.document_id) ?? "Unknown Document",
        }));

        // 7e. Fetch conversation history (last 10 messages)
        const { data: historyRows } = await supabase
          .from("chat_messages")
          .select("id, role, content, citations, created_at")
          .eq("session_id", capturedSessionId)
          .order("created_at", { ascending: false })
          .limit(10);

        const history: ChatMessageInput[] = ((historyRows ?? []) as Array<{
          role: string;
          content: string;
          citations: Citation[] | null;
        }>)
          .reverse()
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citations,
          }));

        // 7f. Build RAG prompt
        const { system, user: userPrompt } = buildRAGPrompt(
          retrievalResults,
          history,
          message,
        );

        // 7g. Use custom system prompt if provided, otherwise use the default
        const finalSystem = customSystemPrompt ?? system;

        // 7h. Stream DeepSeek response via SSE
        await chatCompletionStream(finalSystem, userPrompt, {
          onToken: (token: string) => {
            send("token", { token });
          },
          onComplete: async (fullResponse: string) => {
            try {
              // Extract citations from the response
              const citations = extractCitations(
                fullResponse,
                retrievalResults,
              );

              // Send citations event
              send("citations", { citations });

              // Save assistant message to DB
              const { data: assistantMsg, error: saveError } = await supabase
                .from("chat_messages")
                .insert({
                  session_id: capturedSessionId,
                  role: "assistant",
                  content: fullResponse,
                  citations: citations.length > 0 ? citations : null,
                })
                .select("id")
                .single();

              if (saveError) {
                console.error("[chat] Failed to save assistant message:", saveError);
              }

              // Update session updated_at (and title if first message)
              await supabase
                .from("chat_sessions")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", capturedSessionId);

              // P17: Increment LLM usage
              if (tenantId) {
                await incrementUsage(supabase, tenantId, "llm_calls", {
                  endpoint: "assistant/chat",
                  tokens: 0,
                });
              }

              // Send done event
              send("done", {
                sessionId: capturedSessionId,
                messageId: assistantMsg?.id ?? null,
              });
            } catch (err) {
              console.error("[chat] Error saving assistant message:", err);
              send("done", {
                sessionId: capturedSessionId,
                messageId: null,
              });
            }
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
        const message =
          err instanceof Error ? err.message : "Internal server error";
        send("error", { error: message, code: "INTERNAL_ERROR" });
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
