-- A payment logged on a job (no invoice yet) was rejected. The check was named
-- for a job, but it only accepted an invoice or a lead.

alter table public.payments
  add column if not exists opportunity_id uuid references public.opportunities (id) on delete set null;

create index if not exists payments_opportunity_id_idx on public.payments (opportunity_id);

alter table public.payments drop constraint if exists payments_has_job_or_invoice;

alter table public.payments
  add constraint payments_has_job_or_invoice
  check (
    invoice_id is not null
    or job_id is not null
    or opportunity_id is not null
  );
