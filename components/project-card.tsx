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
import type { Project, MemberRole } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  userRole?: MemberRole;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

export default function ProjectCard({
  project,
  userRole,
  onDelete,
  isDeleting,
}: ProjectCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg truncate">{project.name}</CardTitle>
          {userRole && (
            <Badge variant={userRole === "admin" ? "default" : "secondary"} className="shrink-0">
              {userRole}
            </Badge>
          )}
        </div>
        {project.description && (
          <CardDescription className="line-clamp-2">
            {project.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-xs text-muted-foreground">
          Created {formatDate(project.created_at)}
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2">
        <Link
          href={`/projects/${project.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
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
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
