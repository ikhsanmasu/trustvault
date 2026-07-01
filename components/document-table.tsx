"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Document } from "@/lib/api-client";
import { formatBytes, formatDate, truncateHash } from "@/lib/utils";

interface DocumentTableProps {
  documents: Document[];
  total: number;
  isLoading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  projectId?: string;
  projectName?: string;
  userRole?: "admin" | "editor" | "viewer" | null;
}

export default function DocumentTable({
  documents,
  total,
  isLoading,
  error,
  search,
  onSearchChange,
  onRefresh,
  projectId,
  projectName,
  userRole,
}: DocumentTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      } else {
        // Replace the second selection
        const [first] = next;
        next.clear();
        next.add(first);
        next.add(id);
      }
      return next;
    });
  }

  const selectedArray = Array.from(selected);
  const canCompare = selectedArray.length === 2;
  const canUpload = userRole === "admin" || userRole === "editor";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {projectName
                ? `${total} document${total !== 1 ? "s" : ""} in ${projectName}`
                : `${total} document${total !== 1 ? "s" : ""} uploaded`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-48 sm:w-64"
            />
            <Button variant="outline" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search
                ? "No documents match your search."
                : "No documents in this group yet."}
            </p>
            {!search && canUpload && (
              <p className="text-sm text-muted-foreground mt-2">
                Use the upload form above to add documents.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="w-10 px-2 py-3 font-medium text-muted-foreground">
                    #
                  </th>
                  <th className="px-2 py-3 font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="hidden px-2 py-3 font-medium text-muted-foreground md:table-cell">
                    Binary Hash
                  </th>
                  <th className="hidden px-2 py-3 font-medium text-muted-foreground md:table-cell">
                    Text Hash
                  </th>
                  <th className="hidden px-2 py-3 font-medium text-muted-foreground sm:table-cell">
                    Size
                  </th>
                  <th className="hidden px-2 py-3 font-medium text-muted-foreground lg:table-cell">
                    Uploaded
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const isSelected = selected.has(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`border-b transition-colors hover:bg-muted/50 cursor-pointer ${
                        isSelected ? "bg-accent" : ""
                      }`}
                      onClick={() => toggleSelection(doc.id)}
                    >
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(doc.id)}
                          className="h-4 w-4 rounded border-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-2 py-3 font-medium">{doc.name}</td>
                      <td className="hidden px-2 py-3 font-mono text-xs md:table-cell">
                        {truncateHash(doc.binary_hash)}
                      </td>
                      <td className="hidden px-2 py-3 font-mono text-xs md:table-cell">
                        {truncateHash(doc.text_hash)}
                      </td>
                      <td className="hidden px-2 py-3 sm:table-cell">
                        {formatBytes(doc.file_size_bytes)}
                      </td>
                      <td className="hidden whitespace-nowrap px-2 py-3 lg:table-cell">
                        {formatDate(doc.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {canCompare && (
        <>
          <Separator />
          <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">A</Badge>
              <span>{documents.find((d) => d.id === selectedArray[0])?.name}</span>
              <span className="mx-1">vs</span>
              <Badge variant="secondary">B</Badge>
              <span>{documents.find((d) => d.id === selectedArray[1])?.name}</span>
            </div>
            <Link
              href={`/compare?docA=${selectedArray[0]}&docB=${selectedArray[1]}${projectId ? `&projectId=${projectId}` : ""}`}
              className={buttonVariants({ variant: "default" })}
            >
              Compare Selected
            </Link>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
