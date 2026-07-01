"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { editDocument } from "@/lib/api-client";

interface Props {
  docId: string;
  initialDesc: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EditDocumentModal({ docId, initialDesc, onClose, onSaved }: Props) {
  const [desc, setDesc] = useState(initialDesc);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [docLabels, setDocLabels] = useState<Set<string>>(new Set());
  const [newLabelName, setNewLabelName] = useState("");

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
    await editDocument(docId, { description: desc });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-elevation-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Edit Document</h3>
        <div className="space-y-4">
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
