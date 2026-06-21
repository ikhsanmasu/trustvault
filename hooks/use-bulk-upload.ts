"use client";

import { useState, useCallback } from "react";
import {
  bulkUploadDocuments,
  type BulkUploadItem,
  type BulkUploadResult,
  ApiClientError,
} from "@/lib/api-client";

type UploadStatus = "idle" | "uploading" | "done" | "error";

interface FileEntry {
  file: File;
  name: string;
  status: "pending" | "uploading" | "ok" | "error";
  error?: string;
  code?: string;
}

interface UseBulkUploadReturn {
  files: FileEntry[];
  addFiles: (newFiles: File[]) => void;
  removeFile: (index: number) => void;
  updateFileName: (index: number, name: string) => void;
  clearFiles: () => void;
  uploadAll: () => Promise<BulkUploadResult | null>;
  status: UploadStatus;
  result: BulkUploadResult | null;
  error: string | null;
}

export function useBulkUpload(projectId: string): UseBulkUploadReturn {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(
    (newFiles: File[]) => {
      setFiles((prev) => {
        const updated = [...prev];
        for (const file of newFiles) {
          if (updated.length >= 10) break;
          // Skip duplicates by name + size
          if (updated.some((f) => f.file.name === file.name && f.file.size === file.size)) continue;
          const baseName = file.name.replace(/\.pdf$/i, "").slice(0, 255);
          updated.push({ file, name: baseName, status: "pending" });
        }
        return updated;
      });
      setStatus("idle");
      setResult(null);
      setError(null);
    },
    [],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateFileName = useCallback((index: number, name: string) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, name } : f)),
    );
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  const uploadAll = useCallback(async (): Promise<BulkUploadResult | null> => {
    if (files.length === 0) {
      setError("No files to upload.");
      return null;
    }

    setStatus("uploading");
    setError(null);
    setResult(null);

    // Mark all as uploading
    setFiles((prev) => prev.map((f) => ({ ...f, status: "uploading" as const })));

    try {
      const response = await bulkUploadDocuments(
        files.map((f) => f.file),
        files.map((f) => f.name),
        projectId,
      );
      setResult(response);
      setStatus("done");

      // Update per-file statuses from the response
      setFiles((prev) =>
        prev.map((f) => {
          const match = response.results.find(
            (r: BulkUploadItem) => r.name === f.name,
          );
          if (match) {
            return {
              ...f,
              status: match.status,
              error: match.error,
              code: match.code,
            };
          }
          return { ...f, status: "error" as const, error: "Unknown result" };
        }),
      );

      return response;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Bulk upload failed. Please try again.");
      }
      setStatus("error");

      // Mark remaining pending as error
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "error" as const } : f,
        ),
      );
      return null;
    }
  }, [files, projectId]);

  return {
    files,
    addFiles,
    removeFile,
    updateFileName,
    clearFiles,
    uploadAll,
    status,
    result,
    error,
  };
}
