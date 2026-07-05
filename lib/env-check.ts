// ---------------------------------------------------------------------------
// TrustVault — Environment Variable Validator
// ---------------------------------------------------------------------------
// Runs once at module load. Validates that all required env vars are set.
// In production, exits the process if a required var is missing (fail-fast).
// In development, warns but continues (allows partial config for local dev).
// ---------------------------------------------------------------------------

const IS_PROD = process.env.NODE_ENV === "production";
let _checked = false;

interface EnvVarSpec {
  name: string;
  required: boolean;       // fail if missing in production
  sensitive: boolean;      // never log the value
  pattern?: RegExp;        // optional format validation
  example?: string;        // shown in error message
}

const REQUIRED_VARS: EnvVarSpec[] = [
  // Supabase
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, sensitive: false, example: "http://127.0.0.1:54321" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, sensitive: false, example: "eyJhbGciOiJIUzI1NiIs..." },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, sensitive: true, example: "eyJhbGciOiJIUzI1NiIs..." },
  // AI
  { name: "DEEPSEEK_API_KEY", required: true, sensitive: true, example: "sk-..." },
  // OpenAI embeddings (P6+)
  { name: "OPENAI_API_KEY", required: true, sensitive: true, example: "sk-proj-..." },
  // P5: Blockchain anchoring (optional, only if anchoring is used)
  { name: "ANCHOR_RPC_URL", required: false, sensitive: false, example: "http://127.0.0.1:8545" },
  { name: "ANCHOR_CHAIN_ID", required: false, sensitive: false, example: "31337" },
  { name: "ANCHOR_CONTRACT_ADDRESS", required: false, sensitive: false, example: "0x..." },
  { name: "ANCHOR_PRIVATE_KEY", required: false, sensitive: true, example: "0x..." },
  // P17: Email delivery (only required if sending invitations)
  { name: "RESEND_API_KEY", required: false, sensitive: true, example: "re_..." },
  // P22: Vercel cron authentication (monthly usage reset)
  { name: "CRON_SECRET", required: IS_PROD, sensitive: true, example: "<random-secret>" },
];

export function validateEnvironment(): { ok: boolean; errors: string[]; warnings: string[] } {
  if (_checked) return { ok: true, errors: [], warnings: [] };
  _checked = true;

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const spec of REQUIRED_VARS) {
    const value = process.env[spec.name];

    if (!value || value.trim().length === 0) {
      if (spec.required) {
        errors.push(
          `${spec.name} is not set. Example: ${spec.example ?? "see .env.example"}`,
        );
      } else {
        warnings.push(
          `${spec.name} is not set — some features may be unavailable.`,
        );
      }
      continue;
    }

    // Format validation
    if (spec.pattern && !spec.pattern.test(value)) {
      const msg = `${spec.name} has invalid format. Expected pattern: ${spec.pattern}`;
      if (spec.required) errors.push(msg);
      else warnings.push(msg);
    }
  }

  if (errors.length > 0) {
    const msg = `\n╔════════════════════════════════════════════════╗\n` +
      `║  TRUSTVAULT: Missing required env vars (${errors.length})     ║\n` +
      `╚════════════════════════════════════════════════╝\n` +
      errors.map(e => `  ✗ ${e}`).join("\n") + "\n\n" +
      `Copy .env.example to .env.local and fill in your values.\n`;

    if (IS_PROD) {
      console.error(msg);
      process.exit(1);
    } else {
      console.warn(msg);
    }
  }

  if (warnings.length > 0 && !IS_PROD) {
    console.log(
      `\n[env-check] Optional env vars not set (${warnings.length}):\n` +
      warnings.map(w => `  ⚠ ${w}`).join("\n"),
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

// Auto-validate on first import
validateEnvironment();
