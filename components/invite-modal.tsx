"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { inviteMember, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { IconSpinner } from "@/components/icons";

type InviteRole = "admin" | "editor" | "viewer";

const ROLE_OPTIONS: { value: InviteRole; label: string; description: string }[] = [
  {
    value: "editor",
    label: "Editor",
    description: "Can upload, delete, anchor, and manage labels.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only access to documents and chat.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Full control including member management.",
  },
];

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: () => void;
}

export function InviteModal({ open, onOpenChange, onInvited }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setEmail("");
    setRole("editor");
    setError(null);
    setSuccess(false);
    setIsSending(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSending(true);
    try {
      await inviteMember({ email: email.trim(), role });
      setSuccess(true);
      onInvited?.();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to send invitation. Please try again.");
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Invite Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your tenant. The invitee will receive a link
            via email (in development, the link is logged to the server console).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSend} className="space-y-5 mt-2">
          {/* Email input */}
          <div className="space-y-2">
            <Label htmlFor="invite-email" className="text-sm font-medium">
              Email Address
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSending || success}
              className="rounded-lg h-11"
              autoComplete="email"
            />
          </div>

          {/* Role selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Role</Label>
            <div className="grid gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  disabled={isSending || success}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200",
                    "hover:border-primary/40 hover:bg-primary/5",
                    role === opt.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-card",
                  )}
                >
                  {/* Radio indicator */}
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      role === opt.value
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {role === opt.value && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        role === opt.value ? "text-primary" : "text-foreground",
                      )}
                    >
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {opt.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Error / Success feedback */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              <AlertDescription>
                Invitation sent to <strong>{email}</strong>. They will receive
                an email with instructions to join.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {success ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="rounded-lg"
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSending}
                  className="rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSending || !email.trim()}
                  className="rounded-lg"
                >
                  {isSending ? (
                    <span className="flex items-center gap-2">
                      <IconSpinner className="h-4 w-4" />
                      Sending...
                    </span>
                  ) : (
                    "Send Invitation"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
