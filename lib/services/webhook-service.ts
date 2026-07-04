// ---------------------------------------------------------------------------
// TrustVault — Webhook Processing Service
// ---------------------------------------------------------------------------
// Extracted from webhook/telegram and webhook/whatsapp handlers.
// Reusable functions: signature verification, message validation,
// reply sending, and the core agent message pipeline.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/client";
import { checkWebhookRateLimit } from "@/lib/rate-limit";
import { parseAgent, parseAgentChannel, type AgentRow, type AgentChannelRow } from "@/lib/db-schemas";

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export interface WebhookMessage {
  text: string;
  senderId: string;
  senderName: string;
  chatId?: number | string;
}

export interface RateLimitHeaders {
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
  "Retry-After": string;
}

export interface RateLimitResult {
  allowed: boolean;
  headers?: RateLimitHeaders;
  response?: { error: string; code: string; status: number };
}

// ════════════════════════════════════════════════════════════════════════════
// Step 1: Enforce rate limit and return headers if exceeded
// ════════════════════════════════════════════════════════════════════════════

export function enforceWebhookRateLimit(agentId: string): RateLimitResult {
  const result = checkWebhookRateLimit(agentId, 30, 60_000);
  if (!result.allowed) {
    return {
      allowed: false,
      headers: {
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetAt),
        "Retry-After": String(result.resetAt - Math.ceil(Date.now() / 1000)),
      },
    };
  }
  return { allowed: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Step 2: Validate incoming webhook message
// ════════════════════════════════════════════════════════════════════════════

export function validateWebhookMessage(
  text: string | undefined,
  maxLength = 4000,
): { valid: true; text: string } | { valid: false } {
  if (!text || text.trim().length === 0) return { valid: false };
  const cleaned = text.trim();
  if (cleaned.length > maxLength) return { valid: false };
  return { valid: true, text: cleaned };
}

// ════════════════════════════════════════════════════════════════════════════
// Step 3: Verify agent exists, is active, and has the requested channel
// ════════════════════════════════════════════════════════════════════════════

export type AgentVerification = {
  ok: true;
  agent: AgentRow;
  channel?: AgentChannelRow;
} | {
  ok: false;
  error: string;
  code: string;
  status: number;
};

export async function verifyAgentAndChannel(
  agentId: string,
  channelType?: "whatsapp" | "telegram",
): Promise<AgentVerification> {
  const serviceClient = createServiceClient();

  const { data: agentRow } = await serviceClient
    .from("agents")
    .select("id, tenant_id, is_active")
    .eq("id", agentId)
    .single();

  if (!agentRow) return { ok: false, error: "Agent not found", code: "AGENT_NOT_FOUND", status: 404 };

  const agent = parseAgent(agentRow);
  if (!agent.is_active) return { ok: false, error: "Agent is not active", code: "AGENT_NOT_FOUND", status: 404 };

  if (channelType) {
    const { data: channelRow } = await serviceClient
      .from("agent_channels")
      .select("*")
      .eq("agent_id", agentId)
      .eq("channel_type", channelType)
      .eq("is_active", true)
      .single();

    if (!channelRow) {
      return {
        ok: false,
        error: `No active ${channelType} channel for this agent`,
        code: "CHANNEL_NOT_FOUND",
        status: 404,
      };
    }

    const channel = parseAgentChannel(channelRow);
    return { ok: true, agent, channel };
  }

  return { ok: true, agent };
}

// ════════════════════════════════════════════════════════════════════════════
// Step 4: Truncate and send reply via Telegram API
// ════════════════════════════════════════════════════════════════════════════

export async function sendTelegramReply(
  botToken: string,
  chatId: number,
  text: string,
  maxLength = 4000,
): Promise<{ ok: boolean; error?: string }> {
  const truncated = text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncated,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function sendTelegramErrorReply(
  botToken: string,
  chatId: number,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Sorry, I encountered an error while processing your message. Please try again later.",
      }),
    });
  } catch {
    // Best-effort error reply
  }
}
