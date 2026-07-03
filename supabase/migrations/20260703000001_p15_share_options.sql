-- P15: Add allow_anchor + allow_compare to shared_links
ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS allow_anchor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_compare boolean NOT NULL DEFAULT false;
