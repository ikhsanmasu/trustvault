"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

// ---- Markdown renderer -------------------------------------------------------
// Assistant answers arrive as markdown (headings, lists, tables, code). Render
// them with compact, chat-sized typography instead of dumping raw asterisks.

function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em>{children}</em>,
          h1: ({ children }) => (
            <h1 className="mb-1.5 mt-3 first:mt-0 text-base font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-3 first:mt-0 text-[15px] font-bold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2.5 first:mt-0 text-sm font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-2.5 first:mt-0 text-sm font-semibold">{children}</h4>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 last:mb-0 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 last:mb-0 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-secondary/50 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => (
            <code
              className={cn(
                "rounded bg-foreground/[0.08] px-1 py-0.5 font-hash text-[12px]",
                className,
              )}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-foreground/[0.06] p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-foreground/[0.04] px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
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
          <>
            <MessageMarkdown content={content} />
            <span
              className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current align-text-bottom"
              aria-hidden="true"
            />
          </>
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

        {/* Message content — user input stays literal, assistant answers are markdown */}
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        ) : (
          <MessageMarkdown content={message.content} />
        )}

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
