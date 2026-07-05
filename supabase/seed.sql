-- TrustVault P3 -- local dev/demo seed data
-- Creates tenant, project, profiles, documents (multi-format).
-- THEN run: npx tsx scripts/seed-demo.ts
-- Login: demo@trustvault.dev / demo123456

-- -- Demo tenant --------------------------------------------------------------------
INSERT INTO public.tenants (id, name) VALUES
  ('d3a00000-0000-0000-0000-000000000001', 'Demo Corp')
ON CONFLICT (id) DO NOTHING;

-- -- Demo project -------------------------------------------------------------------
INSERT INTO public.projects (id, tenant_id, name, description) VALUES
  ('d3a00000-0000-0000-0000-000000000010', 'd3a00000-0000-0000-0000-000000000001', 'Legal Contracts', 'Sample project for demo purposes')
ON CONFLICT (id) DO NOTHING;

-- -- Demo documents (multi-format P3) -----------------------------------------------
VALUES
-- --- PDFs ---
(
  'd3a00000-0000-0000-0000-000000000100',
  'Sample Contract v1',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/a1b2c3d4.pdf',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
  'This Agreement is made on January 15, 2026 between Acme Corp (the "Client") and TrustVault Solutions (the "Provider"). The Provider agrees to deliver document integrity services as specified in Exhibit A. All payments are due within 30 days of invoice. This contract is governed by the laws of the State of California.',
  245760,
  'application/pdf',
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
  'Privacy Policy -- Effective Date: March 1, 2026. We collect only the minimum personal data necessary to provide our document integrity verification services. This includes uploaded document metadata, hashes, and extracted text content. We do not sell, share, or otherwise distribute your personal data to third parties. All data is encrypted at rest and in transit.',
  180224,
  'application/pdf',
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
  'SERVICE LEVEL AGREEMENT -- This SLA defines the performance metrics for TrustVault document integrity services. Uptime: 99.9% monthly. Response Time: API endpoints respond within 500ms for 95th percentile. Support Hours: Monday-Friday 9am-6pm UTC. Incident Response: Critical incidents acknowledged within 1 hour. Data Retention: Documents retained for 7 years unless otherwise specified in writing.',
  327680,
  'application/pdf',
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
-- --- DOCX ---
(
  'd3a00000-0000-0000-0000-000000000200',
  'Quarterly Report Q1',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/d4e5f6a7.docx',
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fd5d6f4e1',
  'Q1 2026 Quarterly Report. Revenue grew 23% year-over-year to $4.2M. Operating expenses increased 8% primarily due to new hires in the engineering department. Customer churn rate improved from 4.1% to 3.2%. The product team shipped 14 new features including document comparison and bulk upload.',
  156672,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
-- --- XLSX ---
(
  'd3a00000-0000-0000-0000-000000000201',
  'Budget Forecast 2026',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/e5f6a7b8.xlsx',
  '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fd5d6f4e1',
  'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
  'Budget Category, Q1, Q2, Q3, Q4, Total. Engineering, 450000, 480000, 510000, 520000, 1960000. Marketing, 120000, 140000, 160000, 180000, 600000. Sales, 200000, 220000, 240000, 260000, 920000. Operations, 80000, 85000, 90000, 95000, 350000. Total, 850000, 925000, 1000000, 1055000, 3830000.',
  98304,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
-- --- JSON ---
(
  'd3a00000-0000-0000-0000-000000000202',
  'App Configuration Schema',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/f6a7b8c9.json',
  '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
  '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fc2b6e1202',
  '{"app":{"name":"TrustVault","version":"1.3.0","environment":"production"},"features":{"document_compare":true,"bulk_upload":true,"ai_analysis":true},"limits":{"max_file_size_mb":20,"max_batch_size":50,"supported_types":["pdf","docx","xlsx","json","csv","txt","html","md","xml","png","jpg","webp"]}}',
  40960,
  'application/json',
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
-- --- CSV ---
(
  'd3a00000-0000-0000-0000-000000000203',
  'Customer Import Data',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/a7b8c9d0.csv',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
  'customer_id,name,email,plan,status\nC001,Acme Corp,acme@example.com,enterprise,active\nC002,Beta LLC,beta@example.com,pro,active\nC003,Gamma Inc,gamma@example.com,basic,churned\nC004,Delta Co,delta@example.com,enterprise,active\nC005,Epsilon Ltd,epsilon@example.com,pro,trial',
  20480,
  'text/csv',
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
-- --- Plain Text ---
(
  'd3a00000-0000-0000-0000-000000000204',
  'Release Notes v2.0',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/b8c9d0e1.txt',
  '6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090',
  '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
  'TrustVault v2.0 Release Notes\n=============================\n\nNew Features:\n- Multi-format file support: now supports PDF, DOCX, XLSX, JSON, CSV, TXT, HTML, Markdown, XML, PNG, JPEG, WebP\n- AI-powered change analysis with materiality scoring\n- Tenant isolation with project-level RBAC\n- Bulk upload and comparison\n\nBug Fixes:\n- Fixed text extraction for password-protected PDFs\n- Improved hash computation performance for large files\n\nBreaking Changes: none.',
  12288,
  'text/plain',
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
),
-- --- Markdown ---
(
  'd3a00000-0000-0000-0000-000000000205',
  'API Documentation Overview',
  'uploads/2026/d3a00000-0000-0000-0000-000000000010/c9d0e1f2.md',
  '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
  '6b23c0d5f35d1b11f9b683f0b3a61730deb45dc7544e9e961b934ca497501b88',
  '# TrustVault API\n\n## Authentication\nAll API requests require a Supabase JWT in the Authorization header.\n\n## Endpoints\n\n### POST /api/documents/upload\nUpload a new document for integrity tracking.\n\n### GET /api/documents\nList documents in a project, with optional file_type filter (P3).\n\n### POST /api/documents/compare\nCompare two document versions and get an AI materiality assessment.\n\n## Rate Limits\n- 100 requests per minute per user\n- 20 MB max file size per upload',
  16384,
  'text/markdown',
  'd3a00000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000010',
  'd3a00000-0000-0000-0000-000000000099'
)
ON CONFLICT (id) DO NOTHING;
