"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Select } from "@/components/ui/select";
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
import { useToastState, type ToastData } from "@/hooks/use-toast-state";
import { cn } from "@/lib/utils";
import {
  IconUser,
  IconLock,
  IconHome,
  IconUsers,
  IconX,
  IconSpinner,
  IconChevronDown,
} from "@/components/icons";

// ---- Settings tab type -------------------------------------------------------

type SettingsTab = "profile" | "password" | "tenant" | "members";

const TAB_LABELS: Record<SettingsTab, string> = {
  profile: "Profile",
  password: "Password",
  tenant: "Tenant",
  members: "Members",
};

const TAB_ICONS: Record<SettingsTab, React.ReactNode> = {
  profile: <IconUser className="h-5 w-5" />,
  password: <IconLock className="h-5 w-5" />,
  tenant: <IconHome className="h-5 w-5" />,
  members: <IconUsers className="h-5 w-5" />,
};

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

function getInitials(email: string | undefined): string {
  if (!email) return "U";
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// ---- Password strength bar ---------------------------------------------------

function PasswordStrengthBar({ password }: { password: string }) {
  const strength = useMemo(() => {
    if (!password) return { level: 0, label: "", color: "" };
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 1, label: "Weak", color: "bg-red-500" };
    if (score <= 2) return { level: 2, label: "Fair", color: "bg-amber-500" };
    if (score <= 3) return { level: 3, label: "Good", color: "bg-yellow-500" };
    if (score <= 4) return { level: 4, label: "Strong", color: "bg-emerald-500" };
    return { level: 5, label: "Very strong", color: "bg-emerald-600" };
  }, [password]);

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              i < strength.level ? strength.color : "bg-muted-foreground/15",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{strength.label}</p>
    </div>
  );
}

// ---- Toast UI ----------------------------------------------------------------

function ToastUI({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-elevation-3 animate-slide-up max-w-sm",
        toast.variant === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
        toast.variant === "error" &&
          "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
        toast.variant === "info" &&
          "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
      )}
      role="alert"
    >
      <span className="text-sm font-medium flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---- Profile Tab ------------------------------------------------------------

function ProfileTab() {
  const { user } = useAuthContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToastState();

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
    try {
      const result = await updateProfile({ display_name: displayName });
      setProfile(result.profile);
      showToast("Profile updated successfully.", "success");
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
        <CardContent className="py-10 space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Profile</CardTitle>
        <CardDescription>
          Manage your display name and view your account details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* User identity card */}
        <div className="flex items-center gap-5 p-5 rounded-2xl border bg-muted/20 dark:bg-muted/10">
          <Avatar size="lg" className="h-16 w-16 text-lg ring-2 ring-border/50">
            <AvatarFallback initials={getInitials(user?.email)} />
          </Avatar>
          <div className="min-w-0">
            <p className="text-base font-semibold truncate">
              {profile?.display_name || user?.email?.split("@")[0] || "User"}
            </p>
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {user?.email ?? "Signed in"}
            </p>
            <p className="text-[11px] text-muted-foreground/60 font-mono mt-1">
              ID: {profile?.id?.slice(0, 8)}...
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="display-name" className="text-sm font-medium">
              Display Name
            </Label>
            <Input
              id="display-name"
              placeholder="e.g. Alice Johnson"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={255}
              disabled={isSaving}
              className="rounded-lg h-11"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                This name will be shown to other members in your groups.
              </p>
              <p className="text-xs text-muted-foreground/70 tabular-nums shrink-0 ml-4">
                {displayName.length}/255
              </p>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={isSaving}
            className="rounded-lg h-10 px-6"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <IconSpinner className="h-4 w-4" />
                Saving...
              </span>
            ) : (
              "Save Changes"
            )}
          </Button>
        </form>

        <Separator />

        {/* Account details */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Account Details
          </h4>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/20 dark:bg-muted/10">
              <span className="text-muted-foreground">Tenant ID</span>
              <code className="text-xs font-mono text-foreground/80 truncate max-w-[180px]">
                {profile?.tenant_id?.slice(0, 8)}...
              </code>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/20 dark:bg-muted/10">
              <span className="text-muted-foreground">Member since</span>
              <span className="text-xs tabular-nums font-medium">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/20 dark:bg-muted/10">
              <span className="text-muted-foreground">User ID</span>
              <code className="text-xs font-mono text-foreground/80 truncate max-w-[180px]">
                {profile?.id?.slice(0, 12)}...
              </code>
            </div>
          </div>
        </div>
      </CardContent>

      {toast && <ToastUI toast={toast} onDismiss={dismissToast} />}
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
  const { toast, showToast, dismissToast } = useToastState();

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      showToast("Password changed successfully.", "success");
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
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Change Password</CardTitle>
        <CardDescription>
          Update your account password. You will stay logged in after the change.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChange} className="space-y-5 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-sm font-medium">
              Current Password
            </Label>
            <Input
              id="current-password"
              type="password"
              placeholder="Enter current password"
              value={current_password}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isSaving}
              className="rounded-lg h-11"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-sm font-medium">
              New Password
            </Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Minimum 6 characters"
              value={new_password}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSaving}
              className="rounded-lg h-11"
            />
            <PasswordStrengthBar password={new_password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm New Password
            </Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSaving}
              className={cn(
                "rounded-lg h-11",
                confirmPassword &&
                  new_password !== confirmPassword &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {confirmPassword && new_password !== confirmPassword && (
              <p className="text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={isSaving}
            className="rounded-lg h-10 px-6"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <IconSpinner className="h-4 w-4" />
                Changing...
              </span>
            ) : (
              "Change Password"
            )}
          </Button>
        </form>
      </CardContent>

      {toast && <ToastUI toast={toast} onDismiss={dismissToast} />}
    </Card>
  );
}

// ---- Tenant Tab -------------------------------------------------------------

function TenantTab() {
  const { tenant, isLoading, error, updateTenantName, isUpdating, updateError } =
    useTenant();
  const [name, setName] = useState("");
  const { toast, showToast, dismissToast } = useToastState();
  const [localSuccess, setLocalSuccess] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
    }
  }, [tenant]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLocalSuccess(false);
    if (!name.trim()) return;
    const ok = await updateTenantName(name.trim());
    if (ok) {
      setLocalSuccess(true);
      showToast("Tenant name updated successfully.", "success");
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error || !tenant) {
    return (
      <Card>
        <CardContent className="py-10">
          <Alert variant="destructive">
            <AlertDescription>{error || "Tenant not found."}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Tenant Settings</CardTitle>
        <CardDescription>
          Manage your organization&apos;s tenant configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Tenant info card */}
        <div className="rounded-2xl border bg-muted/10 dark:bg-muted/5 p-5 space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconHome className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-sm">{tenant.name}</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-background/60">
              <span className="text-muted-foreground">Tenant ID</span>
              <code className="text-xs font-mono">{tenant.id.slice(0, 8)}...</code>
            </div>
            <div className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-background/60">
              <span className="text-muted-foreground">Created</span>
              <span className="text-xs tabular-nums font-medium">
                {new Date(tenant.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="tenant-name" className="text-sm font-medium">
              Organization Name
            </Label>
            <Input
              id="tenant-name"
              placeholder="Your organization name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              disabled={isUpdating}
              className="rounded-lg h-11"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                This name identifies your organization.
              </p>
              <p className="text-xs text-muted-foreground/70 tabular-nums shrink-0 ml-4">
                {name.length}/255
              </p>
            </div>
          </div>

          {updateError && (
            <Alert variant="destructive">
              <AlertDescription>{updateError}</AlertDescription>
            </Alert>
          )}

          {localSuccess && !updateError && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              <AlertDescription>Tenant updated successfully.</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={isUpdating || !name.trim()}
            className="rounded-lg h-10 px-6"
          >
            {isUpdating ? (
              <span className="flex items-center gap-2">
                <IconSpinner className="h-4 w-4" />
                Saving...
              </span>
            ) : (
              "Save Changes"
            )}
          </Button>
        </form>
      </CardContent>

      {toast && <ToastUI toast={toast} onDismiss={dismissToast} />}
    </Card>
  );
}

// ---- Members Tab ------------------------------------------------------------

function MembersTab() {
  const { projects, isLoading } = useProjects();
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Group Members</CardTitle>
        <CardDescription>
          View member roles across your groups. Role management is available
          on each group&apos;s detail page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/30 mb-4">
              <IconUser className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-semibold text-muted-foreground">No groups yet</h3>
            <p className="mt-1.5 text-sm text-muted-foreground/60 max-w-xs">
              Create a group first, then add members to collaborate.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project, idx) => (
              <div
                key={project.id}
                className={cn(
                  "rounded-2xl border transition-all duration-200",
                  expandedProjectId === project.id
                    ? "shadow-sm border-primary/20 dark:border-primary/30"
                    : "hover:border-muted-foreground/30",
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedProjectId(
                      expandedProjectId === project.id ? null : project.id,
                    )
                  }
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors duration-150 rounded-2xl"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
                        idx % 6 === 0 && "bg-indigo-500",
                        idx % 6 === 1 && "bg-emerald-500",
                        idx % 6 === 2 && "bg-amber-500",
                        idx % 6 === 3 && "bg-rose-500",
                        idx % 6 === 4 && "bg-violet-500",
                        idx % 6 === 5 && "bg-cyan-500",
                      )}
                    >
                      {project.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold block truncate">
                        {project.name}
                      </span>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <IconChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
                      expandedProjectId === project.id && "rotate-180",
                    )}
                  />
                </button>
                {expandedProjectId === project.id && (
                  <div className="border-t bg-muted/5 dark:bg-muted/10 rounded-b-xl px-5 py-4">
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
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
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
      <p className="text-sm text-muted-foreground py-2 text-center">
        No members in this group yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center gap-3 rounded-lg border bg-background px-3.5 py-3 text-sm transition-colors duration-150 hover:bg-muted/20"
        >
          <Avatar size="sm" className="ring-1 ring-border/60">
            <AvatarFallback
              initials={member.user_id.slice(0, 2).toUpperCase()}
            />
          </Avatar>
          <span className="flex-1 font-mono text-xs truncate text-muted-foreground">
            {member.user_id.slice(0, 12)}...
          </span>
          <Badge
            variant={ROLE_BADGE_VARIANTS[member.role]}
            className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          >
            {ROLE_LABELS[member.role]}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ---- Settings Page (main) ---------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to access settings.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-px w-full" />
        <div className="flex gap-8">
          <Skeleton className="h-64 w-56 rounded-xl shrink-0 hidden lg:block" />
          <Skeleton className="h-96 flex-1 rounded-xl" />
        </div>
      </div>
    );
  }

  const tabs: SettingsTab[] = ["profile", "password", "tenant", "members"];

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl hero-gradient mb-2">
        {/* dot-grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        {/* gold blur blob */}
        <div
          className="absolute -top-20 right-0 w-[250px] h-[250px] rounded-full bg-secondary/5 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative px-6 py-10 sm:py-12">
          <span className="text-xs font-semibold text-secondary uppercase tracking-widest">
            Settings
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-balance">
            Your account
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl text-pretty">
            Manage your profile, security, and tenant configuration
          </p>
        </div>
      </section>

      <Separator />

      {/* Layout: sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Mobile dropdown */}
        <div className="lg:hidden">
          <Select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
            options={tabs.map((t) => ({ value: t, label: TAB_LABELS[t] }))}
            className="w-full h-11 rounded-xl"
          />
        </div>

        {/* Desktop sidebar */}
        <nav className="hidden lg:flex flex-col w-56 shrink-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 mb-2">
            Settings
          </p>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-left w-full",
                activeTab === tab
                  ? "bg-primary/10 text-primary dark:bg-primary/15 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "shrink-0 transition-colors duration-200",
                  activeTab === tab ? "text-primary" : "text-muted-foreground/50",
                )}
              >
                {TAB_ICONS[tab]}
              </span>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "password" && <PasswordTab />}
          {activeTab === "tenant" && <TenantTab />}
          {activeTab === "members" && <MembersTab />}
        </div>
      </div>
    </div>
  );
}
