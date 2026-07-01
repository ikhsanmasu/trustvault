"use client";

import React, { useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ---- Props ------------------------------------------------------------------

interface ChatInputProps {
  /** Called when the user sends a message. */
  onSend: (message: string) => void;
  /** Whether a response is currently streaming — disables input while true. */
  isStreaming: boolean;
  /** Whether the chat is in a loading state. */
  isLoading?: boolean;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Whether the send button should be disabled (e.g., no project selected). */
  disabled?: boolean;
}

// ---- Component --------------------------------------------------------------

export function ChatInput({
  onSend,
  isStreaming,
  isLoading = false,
  placeholder = "Ask a question about your documents...",
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = React.useState("");

  const isDisabled = disabled || isStreaming || isLoading || value.trim().length === 0;

  // Auto-resize the textarea as the user types
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  // Focus the textarea when the component mounts or loading completes
  useEffect(() => {
    if (!isStreaming && !isLoading && !disabled) {
      textareaRef.current?.focus();
    }
  }, [isStreaming, isLoading, disabled]);

  // ---- Handlers -------------------------------------------------------------

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isDisabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isDisabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter without Shift sends the message
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ---- Render ---------------------------------------------------------------

  return (
    <div
      className={cn(
        "flex items-end gap-2 border-t border-border/60 bg-background/95 backdrop-blur-sm",
        "px-4 py-3",
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={isStreaming || isLoading || disabled}
        className={cn(
          "flex-1 resize-none rounded-xl border border-input bg-muted/40",
          "px-4 py-2.5 text-sm leading-relaxed",
          "placeholder:text-muted-foreground/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "max-h-[200px]",
        )}
        aria-label="Chat message input"
      />

      <Button
        onClick={handleSend}
        disabled={isDisabled}
        size="sm"
        className={cn(
          "h-10 w-10 rounded-xl shrink-0 p-0",
          isStreaming && "opacity-50",
        )}
        aria-label="Send message"
      >
        {isStreaming ? (
          /* Spinner while streaming */
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          /* Send arrow */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        )}
        <span className="sr-only">Send</span>
      </Button>
    </div>
  );
}
