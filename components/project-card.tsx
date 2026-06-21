"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Project, MemberRole } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { IconStar, IconCalendar, IconUser, IconSpinner } from "@/components/icons";

// ---- Color palette for card top accent ------------------------------------

const ACCENT_COLORS = [
  "from-indigo-500 to-blue-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-purple-500",
  "from-cyan-500 to-sky-500",
] as const;

function pickAccent(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
}

// ---- Role helpers -----------------------------------------------------------

const ROLE_BADGE_VARIANTS: Record<MemberRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  editor: "secondary",
  viewer: "outline",
};

const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

// ---- Component --------------------------------------------------------------

interface ProjectCardProps {
  project: Project;
  userRole?: MemberRole;
  memberCount?: number;
  memberIds?: string[];
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

export default function ProjectCard({
  project,
  userRole,
  memberCount,
  memberIds = [],
  onDelete,
  isDeleting,
}: ProjectCardProps) {
  const accent = useMemo(() => pickAccent(project.name), [project.name]);

  const displayMembers = memberIds.slice(0, 4);
  const overflow = memberIds.length - displayMembers.length;

  return (
    <Card
      className={cn(
        "group relative flex flex-col overflow-hidden transition-all duration-300 ease-out rounded-2xl",
        "border border-border/60",
        "hover:-translate-y-1 hover:shadow-elevation-3 hover:border-secondary/25",
        "dark:hover:border-secondary/25 dark:hover:shadow-elevation-3",
      )}
    >
      {/* Gold accent line on hover */}
      <div className="absolute top-0.5 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />

      {/* Top gradient accent bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r",
          accent,
          "opacity-80 group-hover:opacity-100 transition-opacity duration-300",
        )}
      />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-semibold truncate tracking-tight leading-snug">
            {project.name}
          </CardTitle>
          {userRole && (
            <Badge
              variant={ROLE_BADGE_VARIANTS[userRole]}
              className={cn(
                "shrink-0 text-[10px] px-2.5 py-0.5 font-semibold uppercase tracking-wide",
                userRole === "admin" && "shadow-sm ring-1 ring-primary/20",
              )}
            >
              {userRole === "admin" && (
                <IconStar className="h-2.5 w-2.5 mr-1 -ml-0.5" />
              )}
              {ROLE_LABELS[userRole]}
            </Badge>
          )}
        </div>
        {project.description ? (
          <CardDescription className="line-clamp-2 text-sm leading-relaxed mt-1">
            {project.description}
          </CardDescription>
        ) : (
          <CardDescription className="text-muted-foreground/40 italic text-sm mt-1">
            No description
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {/* Created date */}
        <p className="text-xs text-muted-foreground tabular-nums flex items-center gap-1.5">
          <IconCalendar className="h-3.5 w-3.5 opacity-60" />
          Created {formatDate(project.created_at)}
        </p>

        {/* Member count with avatar stack */}
        {memberCount !== undefined && memberCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {displayMembers.map((uid) => (
                <Avatar
                  key={uid}
                  size="sm"
                  className="ring-2 ring-background h-6 w-6 text-[9px]"
                >
                  <AvatarFallback initials={uid.slice(0, 2).toUpperCase()} />
                </Avatar>
              ))}
              {overflow > 0 && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-background text-[9px] font-medium text-muted-foreground">
                  +{overflow}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {memberCount === 0 && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
            <IconUser className="h-3.5 w-3.5" />
            No members
          </p>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 pt-1">
        <Link
          href={`/projects/${project.id}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "transition-all duration-200 group-hover:border-primary/30 group-hover:text-primary",
          )}
        >
          Open
        </Link>
        {userRole === "admin" && onDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(project.id)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <span className="flex items-center gap-1">
                <IconSpinner className="h-3.5 w-3.5" />
                Deleting
              </span>
            ) : (
              "Delete"
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
