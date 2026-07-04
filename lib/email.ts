// ---------------------------------------------------------------------------
// TrustVault — Email Delivery Service
// ---------------------------------------------------------------------------
// Uses Resend HTTP API (https://resend.com) — free tier: 100 emails/day.
// Swap `send()` backend to send via SendGrid, Postmark, AWS SES, etc.
// ---------------------------------------------------------------------------

const RESEND_API = "https://api.resend.com/email";
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "TrustVault <noreply@trustvault.app>";
const IS_DEV = process.env.NODE_ENV !== "production";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email via Resend.
 *
 * In development, logs the email content instead of sending (free tier saver).
 * In production, requires RESEND_API_KEY env var.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (IS_DEV) {
    console.log("[email:dev] Would send email:", {
      to: params.to,
      subject: params.subject,
      preview: params.html.slice(0, 200),
    });
    return { ok: true, id: "dev-" + Date.now() };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY not configured");
    return { ok: false, error: "Email service not configured" };
  }

  try {
    const response = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    const data = (await response.json()) as { id?: string; message?: string };

    if (!response.ok) {
      console.error("[email] Resend API error:", data);
      return { ok: false, error: data.message ?? `HTTP ${response.status}` };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return { ok: false, error: "Email delivery failed" };
  }
}

// ---- Pre-built email templates --------------------------------------------

/**
 * Invitation email: sent when an admin invites someone to join their tenant.
 */
export function buildInvitationEmail(params: {
  inviterName: string;
  tenantName: string;
  role: string;
  acceptUrl: string;
}): SendEmailParams {
  const roleLabel = params.role.charAt(0).toUpperCase() + params.role.slice(1);
  return {
    to: "", // filled by caller
    subject: `${params.inviterName} invited you to join ${params.tenantName} on TrustVault`,
    html: `
      <div style="max-width: 560px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e;">
        <h2 style="color: #4f46e5;">TrustVault</h2>
        <p>Hi there,</p>
        <p><strong>${params.inviterName}</strong> has invited you to join <strong>${params.tenantName}</strong> as a <strong>${roleLabel}</strong> on TrustVault.</p>
        <p>With this role, you can ${roleDescription(params.role)}</p>
        <div style="margin: 32px 0;">
          <a href="${params.acceptUrl}" style="background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">TrustVault — Document Integrity Platform</p>
      </div>
    `,
  };
}

function roleDescription(role: string): string {
  switch (role) {
    case "admin":
      return "manage members, upload documents, and configure settings.";
    case "editor":
      return "upload and manage documents.";
    case "viewer":
      return "view and compare documents.";
    default:
      return "access the tenant's documents.";
  }
}
