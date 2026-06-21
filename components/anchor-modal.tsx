"use client";

import { useEffect, useRef } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnchor } from "@/hooks/use-anchor";
import type { Document } from "@/lib/api-client";
import { buildExplorerUrl } from "@/lib/explorers";
import { formatDate, truncateHash, cn } from "@/lib/utils";
import {
  IconShield,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconExternalLink,
  IconSpinner,
} from "@/components/icons";

// ---- Anchor Modal -----------------------------------------------------------

interface AnchorModalProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful anchor so the parent can refresh document data. */
  onAnchored?: () => void;
}

export function AnchorModal({
  document,
  open,
  onOpenChange,
  onAnchored,
}: AnchorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const {
    anchorResult,
    verifyResult,
    isAnchoring,
    isVerifying,
    error,
    anchor,
    verify,
    reset,
  } = useAnchor();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => modalRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  function handleOpenChange(o: boolean) {
    if (!o) {
      reset();
    }
    onOpenChange(o);
  }

  async function handleAnchor() {
    await anchor(document.id);
    onAnchored?.();
  }

  async function handleVerify() {
    await verify(document.id);
  }

  const isAnchored = !!document.fingerprint || !!anchorResult;
  const fingerprint = anchorResult?.fingerprint ?? document.fingerprint ?? null;
  const chain = anchorResult?.chain ?? document.chain ?? null;
  const txHash = anchorResult?.txHash ?? document.tx_hash ?? null;
  const anchoredAt = anchorResult?.anchoredAt ?? null;
  const explorerUrl = buildExplorerUrl(chain, txHash);

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      className="max-w-xl max-h-[92vh] p-0 rounded-3xl border-border shadow-elevation-4"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Blockchain anchor"
        className="focus:outline-none"
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-br from-primary/5 via-primary/3 to-secondary/5 px-6 py-4 border-b border-border">
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full bg-secondary/5 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl",
                  isAnchored
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-secondary/10 text-secondary",
                )}
              >
                <IconShield className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  {isAnchored ? "Blockchain Anchor" : "Anchor Document"}
                </h2>
                <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                  {document.name}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              aria-label="Close"
            >
              Close
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* ── Error ────────────────────────────────────────────── */}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ── State: Anchoring in progress ──────────────────────── */}
          {isAnchoring && (
            <div
              className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-elevation-1"
              role="status"
              aria-label="Anchoring"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                  <IconSpinner className="h-4 w-4 animate-spin text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    Anchoring on blockchain...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sending transaction, waiting for confirmation
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-8 w-full rounded-xl" />
              </div>
            </div>
          )}

          {/* ── State: Not yet anchored ───────────────────────────── */}
          {!isAnchored && !isAnchoring && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                  <IconShield className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    This document has not been anchored yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto leading-relaxed">
                    Anchoring writes a cryptographic fingerprint to the
                    blockchain, creating an immutable proof of this
                    document&rsquo;s integrity. Once anchored, the fingerprint
                    can be verified at any time to detect tampering.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleAnchor}
                  disabled={isAnchoring}
                  size="sm"
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold"
                >
                  <IconShield className="mr-1.5 h-3.5 w-3.5" />
                  Anchor this document
                </Button>
              </div>
            </div>
          )}

          {/* ── State: Already anchored ───────────────────────────── */}
          {isAnchored && !isAnchoring && (
            <div className="space-y-4">
              {/* Fingerprint card */}
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                    <IconCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                      Anchored on-chain
                    </p>
                    <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                      This document&rsquo;s integrity fingerprint is immutably
                      recorded.
                    </p>
                  </div>
                </div>

                <Separator className="bg-emerald-200 dark:bg-emerald-800" />

                {/* Fingerprint */}
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Fingerprint
                  </span>
                  <p className="text-xs font-mono text-foreground/80 mt-0.5 break-all leading-snug">
                    {fingerprint}
                  </p>
                </div>

                {/* Chain + Tx Hash */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Chain
                    </span>
                    <p className="text-sm font-medium mt-0.5 capitalize">
                      {chain ?? "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Anchored At
                    </span>
                    <p className="text-sm font-medium mt-0.5">
                      {anchoredAt
                        ? formatDate(
                            new Date(anchoredAt * 1000).toISOString(),
                          )
                        : document.anchored_at
                          ? formatDate(document.anchored_at)
                          : "—"}
                    </p>
                  </div>
                </div>

                {/* Transaction Hash */}
                {txHash && (
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Transaction Hash
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs font-mono text-foreground/80 truncate">
                        {truncateHash(txHash, 10)}
                      </p>
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors shrink-0"
                        >
                          Explorer
                          <IconExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Verify Section ───────────────────────────────── */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <IconShield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    Verify Integrity
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Recompute the fingerprint from current database hashes and
                  check it against the on-chain registry. This detects whether
                  the document has been tampered with since anchoring.
                </p>

                {/* Verify in progress */}
                {isVerifying && (
                  <div
                    className="flex items-center gap-3 py-2"
                    role="status"
                    aria-label="Verifying"
                  >
                    <IconSpinner className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">
                      Checking on-chain registry...
                    </span>
                  </div>
                )}

                {/* Verify result */}
                {verifyResult && !isVerifying && (
                  <VerifyResultCard result={verifyResult} />
                )}

                <Button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {isVerifying ? (
                    <>
                      <IconSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <IconShield className="mr-1.5 h-3.5 w-3.5" />
                      Verify Now
                    </>
                  )}
                </Button>
              </div>

              {/* Close footer */}
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---- Verify Result Sub-component ---------------------------------------------

function VerifyResultCard({
  result,
}: {
  result: NonNullable<
    ReturnType<typeof useAnchor>["verifyResult"]
  >;
}) {
  const isIntact = result.intact;

  const config = isIntact
    ? {
        bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
        text: "text-emerald-800 dark:text-emerald-200",
        icon: IconCheck,
        label: "Document is intact",
        desc: "The recomputed fingerprint matches the on-chain record. No tampering detected.",
      }
    : {
        bg:
          result.reason === "hash_mismatch"
            ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
            : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
        text:
          result.reason === "hash_mismatch"
            ? "text-red-800 dark:text-red-200"
            : "text-amber-800 dark:text-amber-200",
        icon:
          result.reason === "hash_mismatch" ? IconX : IconAlertTriangle,
        label:
          result.reason === "hash_mismatch"
            ? "Tampering detected"
            : result.reason === "not_anchored"
              ? "Not anchored"
              : "Not on chain",
        desc:
          result.reason === "hash_mismatch"
            ? "The stored hashes have changed since anchoring. The document may have been modified."
            : result.reason === "not_anchored"
              ? "This document has never been anchored."
              : "The fingerprint is in the database but was not found on-chain. The chain may have been reset.",
      };

  const Icon = config.icon;

  return (
    <div
      className={cn("rounded-xl border p-3 space-y-2", config.bg)}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", config.text)} />
        <span className={cn("text-sm font-semibold", config.text)}>
          {config.label}
        </span>
        <Badge
          variant={isIntact ? "success" : "destructive"}
          className="text-[10px] px-1.5 py-0 ml-auto"
        >
          {isIntact ? "INTACT" : "TAMPERED"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{config.desc}</p>
      {result.recomputedFingerprint && (
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Recomputed Fingerprint
          </span>
          <p className="text-[10px] font-mono text-foreground/60 mt-0.5 break-all">
            {truncateHash(result.recomputedFingerprint, 16)}
          </p>
        </div>
      )}
    </div>
  );
}
