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
import { Select } from "@/components/ui/select";
import {
  getProfile,
  updateProfile,
  changePassword,
  getTenantMembers,
  updateMemberRole,
  removeMember,
  type Profile,
  type TenantMember,
  type TenantRole,
  ApiClientError,
} from "@/lib/api-client";
import { InviteModal } from "@/components/invite-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToastState, type ToastData } from "@/hooks/use-toast-state";
import { cn } from "@/lib/utils";
import {
  IconUser,
  IconLock,
  IconUsers,
  IconX,
  IconSpinner,
  IconPlus,
  IconTrash,
} from "@/components/icons";

// ---- Settings tab type -------------------------------------------------------

type SettingsTab = "profile" | "password" | "members";

const TAB_LABELS: Record<SettingsTab, string> = {
  profile: "Profile",
  password: "Password",
  members: "Members",
};

const TAB_ICONS: Record<SettingsTab, React.ReactNode> = {
  profile: <IconUser className="h-5 w-5" />,
  password: <IconLock className="h-5 w-5" />,
  members: <IconUsers className="h-5 w-5" />,
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

    if (score <= 1) return { level: 1, label: "Weak", color: "bg-destructive" };
    if (score <= 2) return { level: 2, label: "Fair", color: "bg-warning" };
    if (score <= 3) return { level: 3, label: "Good", color: "bg-warning" };
    if (score <= 4) return { level: 4, label: "Strong", color: "bg-success" };
    return { level: 5, label: "Very strong", color: "bg-success" };
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
        toast.variant === "success" && "border-success/30 bg-card text-success",
        toast.variant === "error" && "border-destructive/30 bg-card text-destructive",
        toast.variant === "info" && "border-primary/30 bg-card text-primary",
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
                This name is shown to other members of your workspace.
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
            Account details
          </h4>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-xl bg-muted/20 dark:bg-muted/10">
              <span className="text-muted-foreground shrink-0">Member since</span>
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
            <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-xl bg-muted/20 dark:bg-muted/10">
              <span className="text-muted-foreground shrink-0">Workspace ID</span>
              <code
                className="font-hash text-xs text-foreground/80 truncate select-all"
                title={profile?.tenant_id ?? undefined}
              >
                {profile?.tenant_id ?? "—"}
              </code>
            </div>
            <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-xl bg-muted/20 dark:bg-muted/10">
              <span className="text-muted-foreground shrink-0">User ID</span>
              <code
                className="font-hash text-xs text-foreground/80 truncate select-all"
                title={profile?.id ?? undefined}
              >
                {profile?.id ?? "—"}
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


// ---- Members Tab -------------------------------------------------------------

function RoleBadge({ role }: { role: TenantRole }) {
  // Visual intensity mirrors privilege: gold owner, navy admin, soft editor,
  // muted viewer — all from design tokens.
  const variants: Record<TenantRole, string> = {
    owner: "border-secondary/40 bg-secondary/15 text-secondary-foreground dark:text-secondary",
    admin: "border-primary/30 bg-primary/10 text-primary",
    editor: "border-primary/15 bg-primary/5 text-foreground/80 dark:bg-primary/10",
    viewer: "border-border bg-muted text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        variants[role],
      )}
    >
      {role}
    </span>
  );
}

function MembersTab() {
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<TenantMember | null>(null);
  const { toast, showToast, dismissToast } = useToastState();

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [membersResult, profileResult] = await Promise.all([
        getTenantMembers(),
        getProfile(),
      ]);
      setMembers(membersResult.members);
      setTotal(membersResult.total);
      setCurrentProfile(profileResult.profile);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load members.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const currentUserRole = currentProfile?.role ?? null;
  const currentUserId = currentProfile?.id;

  async function handleRoleChange(userId: string, newRole: "admin" | "editor" | "viewer") {
    setChangingRoleFor(userId);
    setActionError(null);
    try {
      await updateMemberRole(userId, newRole);
      showToast("Member role updated successfully.", "success");
      await fetchMembers();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError(err.message);
      } else {
        setActionError("Failed to update role.");
      }
    } finally {
      setChangingRoleFor(null);
    }
  }

  async function handleRemove(userId: string) {
    setRemovingMember(userId);
    setActionError(null);
    try {
      await removeMember(userId);
      showToast("Member removed from the workspace.", "success");
      await fetchMembers();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError(err.message);
      } else {
        setActionError("Failed to remove member.");
      }
    } finally {
      setRemovingMember(null);
    }
  }

  function canChangeRole(member: TenantMember): boolean {
    if (currentUserRole === "owner") return member.role !== "owner";
    if (currentUserRole === "admin") {
      if (member.role === "owner" || member.role === "admin") return false;
      return true;
    }
    return false;
  }

  function canRemove(member: TenantMember): boolean {
    if (member.id === currentUserId) return false; // Will be checked server-side but per spec admin can't remove self if last admin
    if (currentUserRole === "owner") return member.role !== "owner";
    if (currentUserRole === "admin") {
      if (member.role === "owner" || member.role === "admin") return false;
      return true;
    }
    return false;
  }

  function getAvailableRoles(): { value: "admin" | "editor" | "viewer"; label: string }[] {
    const allRoles = [
      { value: "admin" as const, label: "Admin" },
      { value: "editor" as const, label: "Editor" },
      { value: "viewer" as const, label: "Viewer" },
    ];
    if (currentUserRole === "admin") {
      // Admins cannot assign the admin role
      return allRoles.filter((r) => r.value !== "admin");
    }
    return allRoles;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-px w-full" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Workspace members</CardTitle>
            <CardDescription>
              {total} member{total !== 1 ? "s" : ""} — roles control what each
              person can upload, share, and anchor.
            </CardDescription>
          </div>
          {currentUserRole && (currentUserRole === "owner" || currentUserRole === "admin") && (
            <Button
              size="sm"
              onClick={() => setShowInvite(true)}
              className="rounded-lg"
            >
              <IconPlus className="h-4 w-4 mr-1.5" />
              Invite
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {actionError && (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {/* Members list */}
        <div className="divide-y divide-border/60">
          {members.map((member) => {
            const isSelf = member.id === currentUserId;
            return (
              <div
                key={member.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 first:pt-0 last:pb-0"
              >
                {/* Member info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar size="sm" className="h-9 w-9 shrink-0">
                    <AvatarFallback
                      initials={member.email ? member.email.slice(0, 2).toUpperCase() : "U"}
                    />
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {member.display_name || member.email.split("@")[0]}
                        {isSelf && (
                          <span className="text-xs text-muted-foreground ml-1.5 font-normal">
                            (you)
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.email}
                    </p>
                  </div>
                </div>

                {/* Role badge + actions */}
                <div className="flex items-center gap-2 ml-11 sm:ml-0">
                  {canChangeRole(member) && !isSelf ? (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(
                          member.id,
                          e.target.value as "admin" | "editor" | "viewer",
                        )
                      }
                      disabled={changingRoleFor === member.id}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold capitalize focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer disabled:opacity-50"
                      aria-label={`Change role for ${member.display_name || member.email}`}
                    >
                      {getAvailableRoles().map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                      {member.role === "owner" && (
                        <option value="owner">Owner</option>
                      )}
                    </select>
                  ) : (
                    <RoleBadge role={member.role} />
                  )}

                  {/* Remove button */}
                  {canRemove(member) && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(member)}
                      disabled={removingMember === member.id}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title={`Remove ${member.display_name || member.email}`}
                      aria-label={`Remove ${member.display_name || member.email}`}
                    >
                      {removingMember === member.id ? (
                        <IconSpinner className="h-4 w-4" />
                      ) : (
                        <IconTrash className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <InviteModal
        open={showInvite}
        onOpenChange={setShowInvite}
        onInvited={() => {
          fetchMembers();
        }}
      />

      {/* Remove-member confirmation — the most destructive action here */}
      {confirmRemove && (
        <ConfirmDialog
          open={confirmRemove !== null}
          onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}
          title="Remove member"
          description={`Remove ${confirmRemove.display_name || confirmRemove.email} from the workspace? They will immediately lose access to all documents and shares. You can invite them again later.`}
          confirmLabel="Remove"
          variant="destructive"
          onConfirm={() => {
            const member = confirmRemove;
            setConfirmRemove(null);
            handleRemove(member.id);
          }}
        />
      )}

      {toast && <ToastUI toast={toast} onDismiss={dismissToast} />}
    </Card>
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

  const tabs: SettingsTab[] = ["profile", "password", "members"];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, security, and workspace members.
        </p>
      </div>

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
          {activeTab === "members" && <MembersTab />}
        </div>
      </div>
    </div>
  );
}

