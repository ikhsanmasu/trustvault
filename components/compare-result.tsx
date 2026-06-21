"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  compareDocuments,
  getDocument,
  type CompareResponse,
  type Document,
  ApiClientError,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ---- Stage / verdict badge helpers ------------------------------------------

const stageLabels: Record<CompareResponse["stage"], string> = {
  BINARY_MATCH: "Binary Match",
  TEXT_MATCH: "Text Match",
  AI_COMPARE: "AI Compare",
};

function verdictVariant(
  verdict: CompareResponse["verdict"],
): "success" | "destructive" | "warning" | "secondary" | "outline" {
  switch (verdict) {
    case "IDENTICAL":
      return "secondary";
    case "BINARY_DIFF_ONLY":
      return "outline";
    case "MATERIAL":
      return "destructive";
    case "NOT_MATERIAL":
      return "success";
    default:
      return "secondary";
  }
}

function verdictLabel(verdict: CompareResponse["verdict"]): string {
  switch (verdict) {
    case "IDENTICAL":
      return "Identical";
    case "BINARY_DIFF_ONLY":
      return "Binary Diff Only";
    case "MATERIAL":
      return "Material Change";
    case "NOT_MATERIAL":
      return "Not Material";
    default:
      return verdict;
  }
}

function confidenceVariant(
  c: CompareResponse["confidence"],
): "default" | "secondary" | "outline" {
  switch (c) {
    case "HIGH":
      return "default";
    case "MEDIUM":
      return "secondary";
    case "LOW":
      return "outline";
    default:
      return "outline";
  }
}

interface CompareResultProps {
  initialDocAId?: string;
  initialDocBId?: string;
}

export default function CompareResultView({
  initialDocAId,
  initialDocBId,
}: CompareResultProps) {
  const [docAId, setDocAId] = useState(initialDocAId ?? "");
  const [docBId, setDocBId] = useState(initialDocBId ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [docA, setDocA] = useState<Document | null>(null);
  const [docB, setDocB] = useState<Document | null>(null);

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setDocA(null);
    setDocB(null);

    const trimmedA = docAId.trim();
    const trimmedB = docBId.trim();

    if (!trimmedA || !trimmedB) {
      setError("Please enter both document IDs.");
      return;
    }
    if (trimmedA === trimmedB) {
      setError("Cannot compare a document to itself.");
      return;
    }

    setIsLoading(true);
    try {
      const [docAResult, docBResult, compareResult] = await Promise.all([
        getDocument(trimmedA),
        getDocument(trimmedB),
        compareDocuments(trimmedA, trimmedB),
      ]);
      setDocA(docAResult.document);
      setDocB(docBResult.document);
      setResult(compareResult);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Comparison failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Input form */}
      <Card>
        <CardHeader>
          <CardTitle>Compare Documents</CardTitle>
          <CardDescription>
            Enter two document UUIDs to run the integrity comparison pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCompare} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="docA">Document A (baseline)</Label>
                <Input
                  id="docA"
                  placeholder="UUID of first document"
                  value={docAId}
                  onChange={(e) => setDocAId(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docB">Document B (new version)</Label>
                <Input
                  id="docB"
                  placeholder="UUID of second document"
                  value={docBId}
                  onChange={(e) => setDocBId(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Comparing…" : "Compare"}
            </Button>
          </form>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && docA && docB && (
        <Card>
          <CardHeader>
            <CardTitle>Comparison Result</CardTitle>
            <CardDescription>
              Stage: {stageLabels[result.stage]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Documents compared */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-4">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Document A (baseline)
                </div>
                <div className="font-medium">{docA.name}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">
                  {docA.id}
                </div>
              </div>
              <div className="rounded-md border p-4">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Document B (new version)
                </div>
                <div className="font-medium">{docB.name}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">
                  {docB.id}
                </div>
              </div>
            </div>

            <Separator />

            {/* Verdict */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Verdict:</span>
              <Badge variant={verdictVariant(result.verdict)} className="text-sm px-3 py-1">
                {verdictLabel(result.verdict)}
              </Badge>
              {result.confidence && (
                <>
                  <span className="text-sm font-medium">Confidence:</span>
                  <Badge variant={confidenceVariant(result.confidence)}>
                    {result.confidence}
                  </Badge>
                </>
              )}
            </div>

            {/* Hash comparison summary */}
            <div className="grid gap-2 text-sm">
              <div
                className={cn(
                  "rounded-md px-3 py-2 flex items-center gap-2",
                  result.stage === "BINARY_MATCH"
                    ? "bg-green-50 dark:bg-green-950"
                    : "bg-muted/50",
                )}
              >
                <Badge
                  variant={
                    result.stage === "BINARY_MATCH" ? "success" : "outline"
                  }
                >
                  Step 1
                </Badge>
                <span>Binary hashes are{" "}
                  {result.stage === "BINARY_MATCH"
                    ? "identical"
                    : "different"}
                </span>
              </div>
              {result.stage !== "BINARY_MATCH" && (
                <div
                  className={cn(
                    "rounded-md px-3 py-2 flex items-center gap-2",
                    result.stage === "TEXT_MATCH"
                      ? "bg-green-50 dark:bg-green-950"
                      : "bg-muted/50",
                  )}
                >
                  <Badge
                    variant={
                      result.stage === "TEXT_MATCH" ? "success" : "outline"
                    }
                  >
                    Step 2
                  </Badge>
                  <span>Text hashes are{" "}
                    {result.stage === "TEXT_MATCH"
                      ? "identical (binary difference only)"
                      : "different — AI assessment triggered"}
                  </span>
                </div>
              )}
              {result.stage === "AI_COMPARE" && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950 px-3 py-2 flex items-center gap-2">
                  <Badge>Step 3</Badge>
                  <span>AI assessment completed</span>
                </div>
              )}
            </div>

            {/* AI Reasoning */}
            {result.reasoning && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">AI Reasoning</h4>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {result.reasoning}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Deterministic hash pipeline checked before any AI call.
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
