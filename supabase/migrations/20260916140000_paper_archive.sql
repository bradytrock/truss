-- Soft-archive estimates, invoices, and material orders so they leave
-- a job's Paper list without deleting the document.

alter table public.estimates
  add column if not exists archived_at timestamptz;

alter table public.invoices
  add column if not exists archived_at timestamptz;

alter table public.material_orders
  add column if not exists archived_at timestamptz;
