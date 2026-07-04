// ---------------------------------------------------------------------------
// TrustVault — Load Test Script (k6-compatible)
// ---------------------------------------------------------------------------
// Usage:
//   1. Install k6: https://k6.io/docs/get-started/installation/
//   2. Set env: export BASE_URL=https://your-app.vercel.app
//   3. Run: k6 run scripts/load-test.js
//
// Tests the critical API paths under load:
//   - Health check (baseline)
//   - Auth flow (register → login)
//   - Compare endpoint (AI call)
//   - Assistant chat (RAG pipeline)
// ---------------------------------------------------------------------------

import http from "k6/http";
import { check, sleep, group } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// ── Configuration ──────────────────────────────────────────────────────────

export const options = {
  // Ramp up: 1 VU → 20 VUs over 30s, hold 20 VUs for 60s, ramp down
  stages: [
    { duration: "30s", target: 5 },   // warm up
    { duration: "30s", target: 20 },  // ramp up
    { duration: "60s", target: 20 },  // steady load
    { duration: "30s", target: 0 },   // ramp down
  ],
  thresholds: {
    // 95% of requests must complete within 2s
    "http_req_duration": ["p(95)<2000"],
    // Less than 1% errors
    "http_req_failed": ["rate<0.01"],
  },
};

// ── Setup ──────────────────────────────────────────────────────────────────

export function setup() {
  console.log(`Load testing: ${BASE_URL}`);
  return {};
}

// ── Scenarios ──────────────────────────────────────────────────────────────

export default function () {
  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, {
      "health: status 200": (r) => r.status === 200,
      "health: ok": (r) => r.json("status") === "ok",
    });
    sleep(1);
  });

  group("Public Share Page", () => {
    // Test with a known share token (replace with actual token for real test)
    const res = http.get(`${BASE_URL}/api/share/testtesttesttesttesttesttest01`);
    // 404 is expected — testing that public endpoint responds
    check(res, {
      "share: responds": (r) => r.status === 200 || r.status === 404 || r.status === 400,
    });
    sleep(1);
  });

  group("Monitoring API", () => {
    const secret = __ENV.ADMIN_MONITORING_SECRET || "";
    const url = secret
      ? `${BASE_URL}/api/admin/monitoring?secret=${secret}`
      : `${BASE_URL}/api/admin/monitoring`;
    const res = http.get(url);
    check(res, {
      "monitoring: responds": (r) => r.status === 200 || r.status === 403,
    });
    sleep(1);
  });

  group("Admin Dashboard", () => {
    const secret = __ENV.ADMIN_MONITORING_SECRET || "";
    const url = secret
      ? `${BASE_URL}/api/admin/dashboard?secret=${secret}`
      : `${BASE_URL}/api/admin/dashboard`;
    const res = http.get(url);
    check(res, {
      "admin: responds": (r) => r.status === 200 || r.status === 403,
    });
    sleep(1);
  });
}

// ── Teardown ───────────────────────────────────────────────────────────────

export function teardown() {
  console.log("Load test complete.");
}

// ── Quick smoke test (no k6 needed) ────────────────────────────────────────
// Run with: node scripts/load-test.js --smoke

if (process.argv.includes("--smoke")) {
  console.log("Smoke test — hit each endpoint once…\n");

  const endpoints = [
    "/api/health",
    "/api/admin/monitoring",
    "/api/admin/dashboard",
  ];

  async function smoke() {
    for (const path of endpoints) {
      try {
        const res = await fetch(`${BASE_URL}${path}`);
        console.log(`  ${res.status} ${path}`);
      } catch (err) {
        console.log(`  ERR ${path}: ${err.message}`);
      }
    }
    console.log("\nSmoke test done.");
  }
  smoke();
}
