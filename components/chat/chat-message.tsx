"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { Citation, ChatMessage } from "@/lib/ai-api-client";

// ---- Props ------------------------------------------------------------------

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

interface StreamingBubbleProps {
  content: string;
}

interface CitationsListProps {
  citations: Citation[];
}

// ---- Citation chip ----------------------------------------------------------

function CitationChip({ citation }: { citation: Citation }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60",
        "bg-card px-2 py-1 text-xs text-muted-foreground",
        "max-w-[260px]",
      )}
      title={`${citation.document_name} — chunk ${citation.chunk_index}: ${citation.snippet}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3 shrink-0"
        aria-hidden="true"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="truncate">{citation.document_name}</span>
    </span>
  );
}

// ---- Citations list ---------------------------------------------------------

function CitationsList({ citations }: CitationsListProps) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="text-[11px] text-muted-foreground/60 w-full">
        Sources
      </span>
      {citations.map((c) => (
        <CitationChip key={`${c.document_id}-${c.chunk_index}`} citation={c} />
      ))}
    </div>
  );
}

// ---- Streaming skeleton bubble ----------------------------------------------

function StreamingBubble({ content }: StreamingBubbleProps) {
  const hasContent = content.length > 0;

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-4 py-3",
          "border border-border/60 bg-muted/60 text-foreground",
          "rounded-tl-sm",
        )}
      >
        {hasContent ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {content}
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm align-text-bottom" />
          </p>
        ) : (
          <div className="space-y-2 min-w-[120px]">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Single chat message bubble ---------------------------------------------

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "border border-border/60 bg-muted/60 text-foreground rounded-tl-sm",
        )}
      >
        {/* Role label for screen readers */}
        <span className="sr-only">
          {isUser ? "You" : "Assistant"}:
        </span>

        {/* Message content */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {/* Citations (assistant messages only) */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <CitationsList citations={message.citations} />
        )}

        {/* Timestamp */}
        <p
          className={cn(
            "mt-1.5 text-[10px]",
            isUser ? "text-primary-foreground/50" : "text-muted-foreground/50",
          )}
        >
          {new Date(message.created_at).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// ---- Re-export streaming bubble for use in the chat page --------------------

export { StreamingBubble };
