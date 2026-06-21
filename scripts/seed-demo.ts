/**
 * TrustVault — Demo seed helper
 *
 * Run after `npx supabase db reset`:
 *   npx tsx scripts/seed-demo.ts
 *
 * Reads .env.local automatically. Creates demo user + links to Demo Corp.
 * Login: demo@trustvault.dev / demo123456
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Quick .env parser — no dependency needed
function loadEnv(path: string) {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch { /* .env.local not found — rely on existing env */ }
}
loadEnv(resolve(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!adminKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const DEMO_EMAIL = "demo@trustvault.dev";
const DEMO_PASSWORD = "demo123456";
const DEMO_USER_ID = "d3a00000-0000-0000-0000-000000000099";
const DEMO_TENANT = "d3a00000-0000-0000-0000-000000000001";
const DEMO_PROJECT = "d3a00000-0000-0000-0000-000000000010";

async function main() {
  // ── 1. Create demo auth user via REST API ────────────────────────────
  console.log(`Creating demo user: ${DEMO_EMAIL}...`);

  const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminKey}`,
      apikey: adminKey,
      "Content-Type": "application/json",
    } as Record<string, string>,
    body: JSON.stringify({
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Demo User" },
    }),
  });

  if (createResp.ok) {
    console.log("  -> Created.");
  } else {
    const err = await createResp.text();
    // 409 = already exists, that's fine
    if (createResp.status === 409) {
      console.log("  -> Already exists, skipping.");
    } else {
      console.error(`  -> Failed (${createResp.status}): ${err}`);
      process.exit(1);
    }
  }

  // ── 2. Create profile (link to Demo Corp) ────────────────────────────
  // Use the service-role key directly (admin operation)
  const { createClient } = await import("@supabase/supabase-js");
  const adminClient = createClient(SUPABASE_URL, adminKey!);

  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("id", DEMO_USER_ID)
    .single();

  if (!existing) {
    const { error: profileErr } = await adminClient.from("profiles").insert({
      id: DEMO_USER_ID,
      tenant_id: DEMO_TENANT,
      display_name: "Demo User",
    });
    if (profileErr) {
      console.error("Failed to create profile:", profileErr.message);
      process.exit(1);
    }
    console.log("  -> Profile created.");
  } else {
    await adminClient
      .from("profiles")
      .update({ tenant_id: DEMO_TENANT })
      .eq("id", DEMO_USER_ID);
    console.log("  -> Profile updated.");
  }

  // ── 3. Add user as admin of demo project ─────────────────────────────
  const { error: memberErr } = await adminClient.from("project_members").upsert({
    project_id: DEMO_PROJECT,
    user_id: DEMO_USER_ID,
    role: "admin",
  });

  if (memberErr) {
    console.error("Failed to add member:", memberErr.message);
    process.exit(1);
  }

  console.log("  -> Project membership set (admin).");
  console.log(`\n✅ Ready! Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Open: http://localhost:3000/projects/${DEMO_PROJECT}`);
}

main();
