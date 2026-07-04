# TrustVault — Privacy Policy & GDPR Compliance

## 1. Data We Collect

| Category | Data | Purpose | Retention |
|---|---|---|---|
| Account | Email, display name | Authentication, UI display | Until account deletion |
| Documents | Uploaded files, extracted text, hashes | Core service (integrity verification) | Until document deletion or tenant removal |
| Usage | LLM call count, document count, storage bytes | Plan enforcement, billing | Current billing period + 90 days |
| Technical | IP address, user agent (via Vercel/Supabase logs) | Security, rate limiting, debugging | 30 days (Vercel), 7 days (Supabase) |
| Chat | Chat messages, citations, session titles | AI assistant service | Until session deletion |

## 2. Data We Do NOT Collect

- Payment information (handled by Stripe — we never see card numbers)
- Browser fingerprinting
- Third-party tracking cookies
- Personal data from document content (we hash documents, we don't analyze them for PII)

## 3. Data Storage & Processing

| Location | Provider | Region |
|---|---|---|
| Database | Supabase (PostgreSQL) | ap-southeast-1 (Singapore) |
| File Storage | Supabase Storage (S3-compatible) | ap-southeast-1 (Singapore) |
| AI Processing | DeepSeek API (text comparison) | DeepSeek infrastructure |
| AI Embeddings | OpenAI API (text-embedding-3-small) | OpenAI infrastructure |
| Error Tracking | Sentry | US (sentry.io) |
| Email | Resend | US (resend.com) |
| Hosting | Vercel | Global edge (compute at request origin) |

## 4. Your Rights (GDPR / PDP)

| Right | How to Exercise |
|---|---|
| **Access** | Request a data export via Settings → Export Data |
| **Rectification** | Update your profile via Settings |
| **Erasure** | Delete your account via Settings → Delete Account (cascades to all your documents, chats, agents) |
| **Portability** | Export all your documents + data as JSON/PDF via Settings → Export |
| **Restrict Processing** | Contact support@trustvault.app |
| **Object** | Contact support@trustvault.app |

## 5. Data Export Format

When you request a data export, you receive:
- `profile.json` — your account metadata
- `documents/` — all your uploaded files (original format)
- `hashes.json` — SHA-256 hashes of all documents
- `chats.json` — chat history with citations

## 6. Subprocessors

| Subprocessor | Purpose | DPA |
|---|---|---|
| Supabase | Database & file storage | [Supabase DPA](https://supabase.com/legal/dpa) |
| DeepSeek | AI document comparison | N/A (text only, no PII sent) |
| OpenAI | Text embeddings | [OpenAI DPA](https://openai.com/policies/data-processing-addendum) |
| Sentry | Error tracking | [Sentry DPA](https://sentry.io/legal/dpa/) |
| Resend | Transactional email | [Resend DPA](https://resend.com/legal/dpa) |
| Vercel | Application hosting | [Vercel DPA](https://vercel.com/legal/dpa) |

## 7. Cookie Policy

| Cookie | Purpose | Duration | Type |
|---|---|---|---|
| `sb-*-auth-token` | Supabase session | Session | Essential (HTTP-only) |
| No tracking, analytics, or advertising cookies are used. | | | |

## 8. Security Measures

- All data encrypted in transit (TLS 1.3) and at rest (AES-256)
- Tenant isolation via Row-Level Security (RLS) at database level
- Channel credentials (WhatsApp/Telegram) encrypted with AES-256-GCM
- No document content exposed to third parties during AI comparison (only SHA-256 hashes)
- SOC 2 Type II compliance via Supabase

## 9. Contact

- **DPO**: dpo@trustvault.app
- **Support**: support@trustvault.app
- **Security**: security@trustvault.app

*Last updated: 2026-07-05*
