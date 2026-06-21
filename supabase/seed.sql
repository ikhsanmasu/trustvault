-- TrustVault P2 — local dev/demo seed data
-- Creates tenant, project, profiles, documents.
-- THEN run: npx tsx scripts/seed-demo.ts
-- Login: demo@trustvault.dev / demo123456

-- ── Demo tenant ────────────────────────────────────────────────────────────
INSERT INTO public.tenants (id, name) VALUES
  ('d3a00000-0000-0000-0000-000000000001', 'Demo Corp')
ON CONFLICT (id) DO NOTHING;

-- ── Demo project ───────────────────────────────────────────────────────────
INSERT INTO public.projects (id, tenant_id, name, description) VALUES
  ('d3a00000-0000-0000-0000-000000000010', 'd3a00000-0000-0000-0000-000000000001', 'Legal Contracts', 'Sample project for demo purposes')
ON CONFLICT (id) DO NOTHING;

-- ── Demo documents ─────────────────────────────────────────────────────────
INSERT INTO public.documents (id, name, storage_path, binary_hash, text_hash, extracted_text, file_size_bytes, tenant_id, project_id, uploaded_by)
VALUES
(
  'd3a00000-0000-0000-0000-000000000100',
  'Sample Contract v1',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/a1b2c3d4.pdf',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
  'This Agreement is made on January 15, 2026 between Acme Corp (the "Client") and TrustVault Solutions (the "Provider"). The Provider agrees to deliver document integrity services as specified in Exhibit A. All payments are due within 30 days of invoice. This contract is governed by the laws of the State of California.',
  245760,
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
(
  'd3a00000-0000-0000-0000-000000000101',
  'Privacy Policy Draft',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/b2c3d4e5.pdf',
  '6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090',
  '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
  'Privacy Policy — Effective Date: March 1, 2026. We collect only the minimum personal data necessary to provide our document integrity verification services. This includes uploaded document metadata, hashes, and extracted text content. We do not sell, share, or otherwise distribute your personal data to third parties. All data is encrypted at rest and in transit.',
  180224,
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
(
  'd3a00000-0000-0000-0000-000000000102',
  'Service Level Agreement',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/c3d4e5f6.pdf',
  '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
  '6b23c0d5f35d1b11f9b683f0b3a61730deb45dc7544e9e961b934ca497501b88',
  'SERVICE LEVEL AGREEMENT — This SLA defines the performance metrics for TrustVault document integrity services. Uptime: 99.9% monthly. Response Time: API endpoints respond within 500ms for 95th percentile. Support Hours: Monday-Friday 9am-6pm UTC. Incident Response: Critical incidents acknowledged within 1 hour. Data Retention: Documents retained for 7 years unless otherwise specified in writing.',
  327680,
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
)
ON CONFLICT (id) DO NOTHING;
