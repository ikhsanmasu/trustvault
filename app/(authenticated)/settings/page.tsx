"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getProfile,
  updateProfile,
  changePassword,
  listMembers,
  type Profile,
  type ProjectMember,
  type MemberRole,
  ApiClientError,
} from "@/lib/api-client";
import { useTenant } from "@/hooks/use-tenant";
import { useProjects } from "@/hooks/use-projects";

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

// ---- Profile Tab ------------------------------------------------------------

function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getProfile();
      setProfile(result.profile);
      setDisplayName(result.profile.display_name ?? "");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load profile.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (displayName.length > 255) {
      setError("Display name must be 255 characters or fewer.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await updateProfile({ display_name: displayName });
      setProfile(result.profile);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to update profile.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Manage your display name. Your email is managed by authentication.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          {profile && (
            <div className="rounded-md border bg-muted/30 p-3 mb-4">
              <p className="text-sm">
                <span className="text-muted-foreground">User ID: </span>
                <code className="text-xs font-mono">{profile.id}</code>
              </p>
              <p className="text-sm mt-1">
                <span className="text-muted-foreground">Tenant ID: </span>
                <code className="text-xs font-mono">{profile.tenant_id}</code>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              placeholder="Your display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={255}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              {displayName.length}/255 characters
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>Profile updated successfully.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Password Tab -----------------------------------------------------------

function PasswordTab() {
  const [current_password, setCurrentPassword] = useState("");
  const [new_password, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!current_password || !new_password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (new_password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (new_password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await changePassword({ current_password, new_password });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to change password.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>
          Update your account password. You will stay logged in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChange} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              placeholder="Enter current password"
              value={current_password}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password (min 6 characters)"
              value={new_password}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSaving}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>Password changed successfully.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Changing…" : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Tenant Tab -------------------------------------------------------------

function TenantTab() {
  const { tenant, isLoading, error, updateTenantName, isUpdating, updateError } =
    useTenant();
  const [name, setName] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
    }
  }, [tenant]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(false);
    if (!name.trim()) return;
    const ok = await updateTenantName(name.trim());
    if (ok) setSuccess(true);
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !tenant) {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertDescription>{error || "Tenant not found."}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant Settings</CardTitle>
        <CardDescription>
          Manage your organisation&apos;s tenant name. Any tenant member can edit this.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 mb-4">
            <p className="text-sm">
              <span className="text-muted-foreground">Tenant ID: </span>
              <code className="text-xs font-mono">{tenant.id}</code>
            </p>
            <p className="text-sm mt-1">
              <span className="text-muted-foreground">Created: </span>
              {new Date(tenant.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-name">Tenant Name</Label>
            <Input
              id="tenant-name"
              placeholder="Organisation name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              disabled={isUpdating}
            />
            <p className="text-xs text-muted-foreground">
              {name.length}/255 characters
            </p>
          </div>

          {updateError && (
            <Alert variant="destructive">
              <AlertDescription>{updateError}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>Tenant updated successfully.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isUpdating || !name.trim()}>
            {isUpdating ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Members Tab ------------------------------------------------------------

function MembersTab() {
  const { projects, isLoading } = useProjects();
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Members</CardTitle>
        <CardDescription>
          View member roles across your projects. Role management is available
          on each project&apos;s detail page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No projects yet. Create a project to manage members.
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div key={project.id} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedProjectId(
                      expandedProjectId === project.id ? null : project.id,
                    )
                  }
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div>
                    <span className="text-sm font-medium">{project.name}</span>
                    {project.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 transition-transform ${
                      expandedProjectId === project.id ? "rotate-180" : ""
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {expandedProjectId === project.id && (
                  <div className="border-t px-4 py-3">
                    <ProjectMemberList projectId={project.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectMemberList({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listMembers(projectId);
      setMembers(result.members);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load members.");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No members in this project.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <Avatar size="sm">
            <AvatarFallback
              initials={member.user_id.slice(0, 2).toUpperCase()}
            />
          </Avatar>
          <span className="flex-1 font-mono text-xs truncate">
            {member.user_id.slice(0, 8)}…
          </span>
          <Badge variant={ROLE_BADGE_VARIANTS[member.role]}>
            {ROLE_LABELS[member.role]}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ---- Settings Page ----------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>
            Please log in to access settings.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, security, and tenant configuration
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="profile">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="password">
          <PasswordTab />
        </TabsContent>

        <TabsContent value="tenant">
          <TenantTab />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
