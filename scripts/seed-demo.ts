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

  // Retry up to 10 times — Supabase auth may still be starting
  let createResp: Response | undefined;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) { console.log(`  Retry ${attempt}...`); await new Promise(r => setTimeout(r, 3000)); }
    createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
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
    if (createResp.ok || createResp.status === 409 || createResp.status === 422) break;
  }

  if (!createResp) {
    console.error("  -> Failed: could not reach Supabase Auth after retries");
    process.exit(1);
  }

  if (createResp.ok) {
    console.log("  -> Created.");
  } else if (createResp.status === 409 || createResp.status === 422) {
    console.log("  -> Already exists, skipping.");
  } else {
    const err = await createResp.text();
    console.error(`  -> Failed (${createResp.status}): ${err}`);
    process.exit(1);
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
  }, { onConflict: "project_id,user_id" });

  if (memberErr) {
    // Membership may already exist — non-fatal
    console.log("  -> Membership already exists, skipping.");
  } else {
    console.log("  -> Project membership set (admin).");
  }

  // ── 4. Upload sample documents ────────────────────────────────────────
  const samplesDir = resolve(process.cwd(), "samples");
  const EXT_TO_MIME: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".json": "application/json",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };

  let uploaded = 0;
  try {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(samplesDir).filter(f => !f.startsWith("."));

    for (const filename of files) {
      const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
      const mimeType = EXT_TO_MIME[ext];
      if (!mimeType) { console.log(`  ⚠ Skipping ${filename} (unknown type)`); continue; }

      const filePath = resolve(samplesDir, filename);
      const buffer = readFileSync(filePath);
      const storagePath = `uploads/${new Date().getUTCFullYear()}/${DEMO_PROJECT}/${filename}`;

      // Check if already seeded
      const { data: existing } = await adminClient.from("documents").select("id").eq("storage_path", storagePath).single();
      if (existing) { console.log(`  ⏭ ${filename} (already exists)`); continue; }

      // Upload to storage
      const { error: uploadErr } = await adminClient.storage.from("pdf-uploads").upload(storagePath, buffer, { contentType: mimeType, upsert: false });
      if (uploadErr) { console.error(`  ❌ ${filename}: upload failed — ${uploadErr.message}`); continue; }

      // Compute hashes
      const { createHash } = await import("node:crypto");
      const binaryHash = createHash("sha256").update(buffer).digest("hex");
      // Try UTF-8 decode; fallback to empty for binary files (DOCX, XLSX, PDF)
      let textContent = "";
      try {
        textContent = new TextDecoder("utf-8", { fatal: true }).decode(buffer).slice(0, 40000);
      } catch { /* binary file — store empty text */ }
      const textHash = createHash("sha256").update(textContent, "utf-8").digest("hex");

      // Insert DB record
      const displayName = filename.replace(ext, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const { error: dbErr } = await adminClient.from("documents").insert({
        name: displayName,
        storage_path: storagePath,
        binary_hash: binaryHash,
        text_hash: textHash,
        extracted_text: textContent,
        file_size_bytes: buffer.length,
        file_type: mimeType,
        tenant_id: DEMO_TENANT,
        project_id: DEMO_PROJECT,
        uploaded_by: DEMO_USER_ID,
      });
      if (dbErr) { console.error(`  ❌ ${filename}: DB insert failed — ${dbErr.message}`); continue; }
      console.log(`  ✅ ${filename} (${(buffer.length / 1024).toFixed(1)} KB, ${mimeType})`);
      uploaded++;
    }
  } catch (err: any) {
    if (err.code === "ENOENT") { console.log("  ⚠ samples/ directory not found — skipping sample uploads."); }
    else { console.error("  ❌ Error reading samples:", err.message); }
  }

  console.log(`  -> Uploaded ${uploaded} sample document${uploaded !== 1 ? "s" : ""}.`);
  console.log(`\n✅ Ready! Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Open: http://localhost:3000/projects/${DEMO_PROJECT}`);
}

main();
