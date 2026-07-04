"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { editDocument, checkDocumentName } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Props {
  docId: string;
  initialName: string;
  initialDesc: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EditDocumentModal({ docId, initialName, initialDesc, onClose, onSaved }: Props) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [docLabels, setDocLabels] = useState<Set<string>>(new Set());
  const [newLabelName, setNewLabelName] = useState("");
  const [nameWarning, setNameWarning] = useState<{ exists: boolean; suggestion?: string } | null>(null);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced duplicate name check
  function handleNameChange(value: string) {
    setName(value);
    if (dupTimer.current) clearTimeout(dupTimer.current);
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      setNameWarning(null);
      return;
    }
    dupTimer.current = setTimeout(async () => {
      try {
        const res = await checkDocumentName(trimmed);
        if (res.exists) {
          let n = 1;
          let suggestion = "";
          while (n <= 99) {
            suggestion = `${trimmed} (${n})`;
            const check = await checkDocumentName(suggestion);
            if (!check.exists) break;
            n++;
          }
          setNameWarning({ exists: true, suggestion });
        } else {
          setNameWarning(null);
        }
      } catch {
        // fail open
      }
    }, 500);
  }

  useEffect(() => {
    // Fetch all labels
    fetch("/api/labels").then(r => r.json()).then(d => setLabels(d.labels ?? [])).catch(() => {});
    // Fetch document labels
    fetch(`/api/documents/${docId}/labels`).then(r => r.json()).then(d => {
      setDocLabels(new Set((d.labels as { id: string }[])?.map(l => l.id) ?? []));
    }).catch(() => {});
  }, [docId]);

  async function toggleLabel(labelId: string) {
    const next = new Set(docLabels);
    if (next.has(labelId)) {
      await fetch(`/api/documents/${docId}/labels?labelId=${labelId}`, { method: "DELETE" });
      next.delete(labelId);
    } else {
      await fetch(`/api/documents/${docId}/labels`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelIds: [labelId] }),
      });
      next.add(labelId);
    }
    setDocLabels(next);
  }

  async function createLabel() {
    const name = newLabelName.trim();
    if (!name) return;
    const r = await fetch("/api/labels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      const d = await r.json();
      setLabels(prev => [...prev, d.label]);
      setNewLabelName("");
      // Auto-toggle the new label
      const next = new Set(docLabels);
      next.add(d.label.id);
      setDocLabels(next);
      await fetch(`/api/documents/${docId}/labels`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelIds: [d.label.id] }),
      });
    }
  }

  async function handleSave() {
    setSaving(true);
    const updates: { name?: string; description?: string } = { description: desc };
    if (name.trim() && name.trim() !== initialName) {
      updates.name = name.trim();
    }
    await editDocument(docId, updates);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-elevation-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Edit Document</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={255}
              className={cn(
                "w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20",
                nameWarning?.exists ? "border-amber-400" : "border-border",
              )}
              placeholder="Document name"
            />
            {nameWarning?.exists && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-amber-600 font-medium">Name already exists</span>
                {nameWarning.suggestion && (
                  <>
                    <span className="text-[10px] text-muted-foreground">— try:</span>
                    <button
                      type="button"
                      onClick={() => { setName(nameWarning.suggestion!); setNameWarning(null); }}
                      className="text-[10px] font-medium text-primary hover:underline"
                    >
                      {nameWarning.suggestion}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 1000))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-20" placeholder="Add a description…" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Labels</label>
            <div className="flex flex-wrap gap-1.5 mb-2 max-h-32 overflow-y-auto">
              {labels.map((l) => (
                <button key={l.id} type="button" onClick={() => toggleLabel(l.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                    docLabels.has(l.id) ? "border-transparent text-white" : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                  style={docLabels.has(l.id) ? { backgroundColor: l.color } : undefined}
                >
                  {l.name}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input type="text" placeholder="+ new label" value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value.slice(0, 50))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createLabel(); } }}
                className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <Button size="sm" variant="outline" onClick={createLabel} disabled={!newLabelName.trim()}>Add</Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
