"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ProjectMember, MemberRole } from "@/lib/api-client";

const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function roleBadgeVariant(role: MemberRole): "default" | "secondary" | "outline" {
  switch (role) {
    case "admin":
      return "default";
    case "editor":
      return "secondary";
    case "viewer":
      return "outline";
    default:
      return "outline";
  }
}

function getInitials(userId: string): string {
  // Simple initials from the first 2 chars of the UUID
  return userId.slice(0, 2).toUpperCase();
}

interface MemberListProps {
  members: ProjectMember[];
  currentUserId?: string;
  currentRole: MemberRole | null;
  isLoading: boolean;
  onAddMember: (data: { user_id: string; role: MemberRole }) => Promise<ProjectMember | null>;
  onChangeRole: (userId: string, role: MemberRole) => Promise<boolean>;
  onRemoveMember: (userId: string) => Promise<boolean>;
}

export default function MemberList({
  members,
  currentUserId,
  currentRole,
  isLoading,
  onAddMember,
  onChangeRole,
  onRemoveMember,
}: MemberListProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<MemberRole>("viewer");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isAdmin = currentRole === "admin";

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!newUserId.trim()) {
      setAddError("Please enter a user ID.");
      return;
    }

    setIsAdding(true);
    try {
      const result = await onAddMember({
        user_id: newUserId.trim(),
        role: newRole,
      });
      if (result) {
        setAddDialogOpen(false);
        setNewUserId("");
        setNewRole("viewer");
      }
    } catch {
      setAddError("Failed to add member.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    setRemovingId(userId);
    await onRemoveMember(userId);
    setRemovingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Members ({members.length})
        </h3>
        {isAdmin && (
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            Add Member
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No members yet.
        </p>
      ) : (
        <div className="space-y-1">
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const isLastAdmin =
              isAdmin &&
              member.role === "admin" &&
              members.filter((m) => m.role === "admin").length <= 1;

            return (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <Avatar size="sm">
                  <AvatarFallback initials={getInitials(member.user_id)} />
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {member.user_id.slice(0, 8)}…
                      {isSelf && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (you)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Role selection (admin only, except last admin self) */}
                {isAdmin && !(isSelf && isLastAdmin) ? (
                  <Select
                    options={[
                      { value: "admin", label: "Admin" },
                      { value: "editor", label: "Editor" },
                      { value: "viewer", label: "Viewer" },
                    ]}
                    value={member.role}
                    onChange={(e) =>
                      onChangeRole(member.user_id, e.target.value as MemberRole)
                    }
                    className="w-28 h-8 text-xs"
                  />
                ) : (
                  <Badge
                    variant={roleBadgeVariant(member.role)}
                    className="shrink-0"
                  >
                    {ROLE_LABELS[member.role]}
                  </Badge>
                )}

                {/* Remove button (admin only, not self if last admin) */}
                {isAdmin && !isSelf && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleRemove(member.user_id)}
                    disabled={removingId === member.user_id}
                  >
                    {removingId === member.user_id ? "…" : "Remove"}
                  </Button>
                )}
                {isSelf && isAdmin && !isLastAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleRemove(member.user_id)}
                    disabled={removingId === member.user_id}
                  >
                    Leave
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add member dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Add a user to this project by their user ID. They must be in your tenant.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleAdd}>
          <DialogContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-member-id">User ID</Label>
              <Input
                id="new-member-id"
                placeholder="UUID of the user to add"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                disabled={isAdding}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-member-role">Role</Label>
              <Select
                id="new-member-role"
                options={[
                  { value: "admin", label: "Admin — Full access" },
                  { value: "editor", label: "Editor — Upload documents" },
                  { value: "viewer", label: "Viewer — Read only" },
                ]}
                value={newRole}
                onChange={(e) =>
                  setNewRole(e.target.value as MemberRole)
                }
                disabled={isAdding}
              />
            </div>
            {addError && (
              <Alert variant="destructive">
                <AlertDescription>{addError}</AlertDescription>
              </Alert>
            )}
          </DialogContent>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={isAdding}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isAdding}>
              {isAdding ? "Adding…" : "Add Member"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
