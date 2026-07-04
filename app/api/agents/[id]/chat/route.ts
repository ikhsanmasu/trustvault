// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents/[id]/chat (playground SSE chat)
// ---------------------------------------------------------------------------
// Follows the same SSE streaming pattern as /api/assistant/chat (P6).
// Uses the agent's system_prompt and scopes RAG to the agent's knowledge-base
// documents via agent_documents.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";
import { checkLLMLimit, incrementUsage } from "@/lib/rate-limit";
import type {
  AgentChatRequest,
  ErrorResponse,
} from "@/lib/types";
import {
  streamAgentChat,
} from "@/lib/agent-channel";
import { createServiceClient } from "@/lib/supabase/client";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 4000;

// ---------------------------------------------------------------------------
// POST /api/agents/[id]/chat (SSE streaming)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ErrorResponse>> {
  const { id: agentId } = await params;

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

  // -- 2. Validate agentId --------------------------------------------------
  if (!isValidUUID(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch agent (RLS ensures tenant access) ---------------------------
  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("id, system_prompt, is_active, tenant_id")
    .eq("id", agentId)
    .single();

  if (agentError || !agentRow) {
    return NextResponse.json(
      { error: "Agent not found", code: "AGENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Parse body --------------------------------------------------------
  let body: AgentChatRequest;
  try {
    body = (await request.json()) as AgentChatRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "MISSING_MESSAGE" },
      { status: 400 },
    );
  }

  const { session_id, message } = body;

  // -- 5. Validate message --------------------------------------------------
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

  // -- 6. Validate session_id if provided -----------------------------------
  if (session_id !== undefined && session_id !== null) {
    if (typeof session_id !== "string" || !isValidUUID(session_id)) {
      return NextResponse.json(
        { error: "session_id must be a valid UUID", code: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
  }

  // -- 7. Resolve/create session --------------------------------------------
  let resolvedSessionId: string;

  if (session_id) {
    // Verify session exists and user owns it
    const { data: existingSession, error: sessionError } = await supabase
      .from("agent_sessions")
      .select("id, agent_id, user_id")
      .eq("id", session_id)
      .single();

    if (sessionError || !existingSession) {
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }

    const es = existingSession as Record<string, unknown>;
    if ((es.user_id as string) !== user.id) {
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
    if ((es.agent_id as string) !== agentId) {
      return NextResponse.json(
        { error: "Session does not belong to this agent", code: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }

    resolvedSessionId = session_id;
  } else {
    // Create new session
    const title = message.slice(0, 100);
    const { data: newSession, error: createError } = await supabase
      .from("agent_sessions")
      .insert({
        agent_id: agentId,
        user_id: user.id,
        title,
      })
      .select("id")
      .single();

    if (createError || !newSession) {
      return NextResponse.json(
        { error: "Failed to create session", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    resolvedSessionId = (newSession as Record<string, unknown>).id as string;
  }

  // -- 8. Insert user message -----------------------------------------------
  const supabaseService = createServiceClient();

  await supabaseService.from("agent_messages").insert({
    agent_id: agentId,
    session_id: resolvedSessionId,
    role: "user",
    content: message,
    channel: null,
    external_user_id: null,
  });

  // Captured values for the streaming closure
  const capturedSessionId = resolvedSessionId;
  const capturedAgentId = agentId;
  const capturedMessage = message;

  // -- 9. Build and return SSE stream ---------------------------------------
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        await streamAgentChat(
          capturedAgentId,
          capturedSessionId,
          capturedMessage,
          user.id,
          {
            onToken: (token: string) => {
              send("token", { token });
            },
            onComplete: (_fullResponse: string) => {
              // P17: Increment LLM usage
              if (tenantId) {
                incrementUsage(supabase, tenantId, "llm_calls", {
                  endpoint: "agents/chat",
                  tokens: 0,
                }).catch((err) => {
                  console.error("[agent-chat] Failed to increment usage:", err);
                });
              }
              send("done", {
                sessionId: capturedSessionId,
                messageId: null, // Will be populated by streamAgentChat
              });
              controller.close();
            },
            onError: (err: Error) => {
              send("error", {
                error: err.message,
                code: "AI_API_ERROR",
              });
              controller.close();
            },
          },
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Internal server error";
        send("error", { error: msg, code: "INTERNAL_ERROR" });
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
