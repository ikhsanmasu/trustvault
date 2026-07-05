"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// ---- Generic session shape for cross-page reuse (P6 assistant) ----------

export interface SessionLike {
  id: string;
  title: string;
  updated_at: string;
}

// ---- Props ------------------------------------------------------------------

interface ChatSessionListProps {
  sessions: SessionLike[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
}

// ---- Helpers ----------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---- Component --------------------------------------------------------------

export function ChatSessionList({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: ChatSessionListProps) {
  const [deleteTarget, setDeleteTarget] = useState<SessionLike | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    await onDeleteSession(deleteTarget.id);
    setIsDeleting(false);
    setDeleteTarget(null);
  }, [deleteTarget, onDeleteSession]);

  return (
    <div className="flex flex-col h-full">
      {/* ---- New Chat button ---- */}
      <div className="shrink-0 px-3 py-3">
        <Button
          onClick={onNewSession}
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-sm"
          disabled={isLoading}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </Button>
      </div>

      {/* ---- Session list ---- */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 && !isLoading && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground/60">
            No conversations yet.
            <br />
            Start a new chat to begin.
          </p>
        )}

        {isLoading && sessions.length === 0 && (
          <div className="space-y-2 px-2 py-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-md bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}

        <ul className="space-y-0.5">
          {sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            const isHovered = session.id === hoveredId;

            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  onMouseEnter={() => setHoveredId(session.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    "group relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left",
                    "text-sm transition-colors duration-150",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
                  )}

                  {/* Chat icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground/50 group-hover:text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>

                  {/* Title + time */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[13px] leading-tight">
                      {session.title || "Untitled Chat"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {formatRelativeTime(session.updated_at)}
                    </p>
                  </div>

                  {/* Delete button (visible on hover) */}
                  {isHovered && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(session);
                      }}
                      className={cn(
                        "flex items-center justify-center h-6 w-6 rounded-md shrink-0",
                        "text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10",
                        "transition-colors duration-150",
                      )}
                      aria-label={`Delete chat "${session.title}"`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- Delete confirmation dialog ---- */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete Chat</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{deleteTarget?.title || "Untitled Chat"}&rdquo;?
            This action cannot be undone and all messages in this conversation will be permanently removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteTarget(null)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
