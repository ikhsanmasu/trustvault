# Data Retention Policy

**Meridian Labs — Internal Policy ML-DR-07**
Effective date: 2025-04-01 · Owner: Information Security · Review cycle: annual

## 1. Purpose

This policy defines how long Meridian Labs retains business records and when
they are securely disposed of. It exists to balance operational need, legal
obligation, and storage cost.

## 2. Scope

Applies to all employees, contractors, and automated systems that create or
store company records, regardless of medium (cloud storage, email, databases,
or paper).

## 3. Retention periods

| Record type            | Retention | Disposal method        |
|------------------------|-----------|------------------------|
| Signed contracts       | 7 years   | Secure archive, then shred |
| Financial statements   | 7 years   | Encrypted cold storage |
| Invoices & receipts    | 5 years   | Soft delete + purge    |
| Internal meeting notes | 2 years   | Soft delete            |
| System access logs     | 1 year    | Automated rotation     |

## 4. Integrity requirement

Records under legal hold must be **tamper-evident**. Each archived document is
fingerprinted on ingestion, and the fingerprint is anchored to an immutable
ledger. Any later modification invalidates the proof and is flagged for review.

## 5. Exceptions

Legal hold overrides all retention limits. Records subject to active litigation
or audit are retained until the hold is formally released by Legal.

---
*Questions: infosec@meridianlabs.example*
