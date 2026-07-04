"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { uploadDocument, type Document, ApiClientError } from "@/lib/api-client";
import { formatBytes, formatDate, truncateHash } from "@/lib/utils";

interface UploadFormProps {
  onSuccess?: (document: Document) => void;
}

export default function UploadForm({ onSuccess }: UploadFormProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !name) {
      // Pre-fill name from filename (minus extension)
      const base = selected.name.replace(/\.pdf$/i, "").slice(0, 255);
      setName(base);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUploadedDocument(null);

    if (!file) {
      setError("Please select a PDF file to upload.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Only PDF files are accepted.");
      return;
    }
    if (!name.trim()) {
      setError("Please provide a document name.");
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadDocument(file, name.trim());
      setUploadedDocument(result.document);
      onSuccess?.(result.document);
      // Reset form
      setName("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Upload failed. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Document</CardTitle>
        <CardDescription>
          Upload a PDF to this group. Hashes are computed automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document-name">Document Name</Label>
            <Input
              id="document-name"
              placeholder="e.g. Contract v1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              disabled={isUploading}
            />
            <p className="text-xs text-muted-foreground">
              {name.length}/255 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-file">PDF File (max 20 MB)</Label>
            <Input
              id="document-file"
              type="file"
              accept="application/pdf"
              ref={fileInputRef}
              onChange={handleFileChange}
              disabled={isUploading}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} — {formatBytes(file.size)}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isUploading || !file}>
            {isUploading ? "Uploading…" : "Upload"}
          </Button>
        </form>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {uploadedDocument && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="success">Uploaded</Badge>
                <span className="font-medium">{uploadedDocument.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Binary Hash: </span>
                  <code className="text-xs font-mono">
                    {truncateHash(uploadedDocument.binary_hash)}
                  </code>
                </div>
                <div>
                  <span className="text-muted-foreground">Text Hash: </span>
                  <code className="text-xs font-mono">
                    {truncateHash(uploadedDocument.text_hash)}
                  </code>
                </div>
                <div>
                  <span className="text-muted-foreground">Size: </span>
                  {formatBytes(uploadedDocument.file_size_bytes)}
                </div>
                <div>
                  <span className="text-muted-foreground">Created: </span>
                  {formatDate(uploadedDocument.created_at)}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
