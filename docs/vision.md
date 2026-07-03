# InTrustVault — Vision

## Problem
Documents change over time. Detecting *that* a file changed is a solved, commodity problem (hashing, diffing). The harder and more valuable question in audit, legal, and compliance work is: **does a change actually matter?** A reformatted paragraph is noise; a changed payment
amount or an altered obligation is critical. Existing integrity tools flag that bytes differ but cannot judge the *significance* of a change.

## Solution
InTrustVault is a document-integrity platform that combines:

1. **Layered verification** — hash at multiple levels (raw file, extracted text, and later a semantic summary) so we can distinguish "the file was re-saved" from "the content actuall changed".
2. **AI materiality assessment** — when content differs, an AI judges whether the change is **material** (alters meaning, value, or obligation) or **cosmetic** — assessed against a verified baseline.
3. **Tamper-evident proofs** — each verified document produces a proof that can later be anchored to be tamper-resistant.

## Core principles
- **Deterministic first, AI second.** Cheap, exact checks (hashing) run before any AI call; the AI is reserved for judgment that exact checks cannot make.
- **Materiality over detection.** The job is not to detect forgery — it is to assess whether change is significant.
- **Verified baseline.** Comparisons are always made against a previously stored, verified version.

## Target users
Audit teams, legal/compliance reviewers, and multi-team document workflows where knowing *whether* a change matters — not just that it happened — drives decisions.

## What makes it different
Most tools answer "did this change?" InTrustVault answers "**does this change matter?**" — the question that actually requires judgment.

## Non-goals (for now)
- Not an e-signature service.
- Not OCR for scanned documents (text-based PDFs only in early phases).
- Not a general document-management system.