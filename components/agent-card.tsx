"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Agent } from "@/lib/api-client";

// ---- Props ------------------------------------------------------------------

interface AgentCardProps {
  agent: Agent;
  channelCount?: number;
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

function truncatePrompt(prompt: string, maxLen = 100): string {
  if (prompt.length <= maxLen) return prompt;
  return `${prompt.slice(0, maxLen).trimEnd()}…`;
}

// ---- Component --------------------------------------------------------------

export function AgentCard({ agent, channelCount = 0 }: AgentCardProps) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
    >
      <Card
        className={cn(
          "group relative p-5 h-full",
          "border-border/60 bg-card",
          "hover:border-primary/30 hover:shadow-md",
          "transition-all duration-200",
        )}
      >
        {/* Status indicator dot */}
        <div className="absolute top-4 right-4">
          <span
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-medium",
              agent.is_active ? "text-emerald-600" : "text-muted-foreground/60",
            )}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                agent.is_active
                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                  : "bg-muted-foreground/30",
              )}
            />
            {agent.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Name */}
        <h3 className="text-base font-semibold text-foreground mb-2 pr-20 line-clamp-1">
          {agent.name}
        </h3>

        {/* Prompt preview */}
        <p className="text-[13px] text-muted-foreground/80 leading-relaxed mb-4 line-clamp-2">
          {truncatePrompt(agent.system_prompt)}
        </p>

        {/* Footer meta */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/40">
          <div className="flex items-center gap-2">
            {/* Channel badge */}
            {channelCount > 0 && (
              <Badge variant="secondary" className="text-[11px] h-5 px-1.5">
                {channelCount} channel{channelCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground/50">
            {formatRelativeTime(agent.updated_at)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
