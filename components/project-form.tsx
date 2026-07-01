"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ProjectFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string }) => Promise<boolean>;
  title?: string;
  initialName?: string;
  initialDescription?: string;
  isEdit?: boolean;
}

export default function ProjectForm({
  open,
  onOpenChange,
  onSubmit,
  title = "Create Group",
  initialName = "",
  initialDescription = "",
  isEdit = false,
}: ProjectFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  function handleOpenChange(open: boolean) {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setError(null);
    }
    onOpenChange(open);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Group name is required.");
      return;
    }
    if (name.trim().length > 255) {
      setError("Group name must be 255 characters or fewer.");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (success) {
        handleOpenChange(false);
      }
    } catch {
      setError("Failed to save group.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update the group name and description."
            : "Create a new group to organise documents."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Group Name</Label>
            <Input
              id="project-name"
              placeholder="e.g. Q4 Contracts"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              {name.length}/255 characters
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea
              id="project-description"
              placeholder="What is this group about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save Changes"
                : "Create Group"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
