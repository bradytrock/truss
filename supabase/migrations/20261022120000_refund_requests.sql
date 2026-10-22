-- Refund requests: a job seat asks to send money back, Accounting approves
-- and marks it refunded. The completed refund also posts a negative payment.

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  number text not null,
  amount numeric(14, 2) not null,
  fee_amount numeric(14, 2) not null default 0,
  fee_covered_by_company boolean not null default true,
  full_refund boolean not null default true,
  reason text not null default '',
  note text not null default '',
  destination text not null default 'original',
  destination_label text not null default '',
  attachment_name text not null default '',
  attachment_url text not null default '',
  status text not null default 'requested',
  requested_by text not null default '',
  requested_by_name text not null default '',
  requested_at timestamptz not null default now(),
  decided_by text not null default '',
  decided_by_name text not null default '',
  decided_at timestamptz,
  deny_reason text not null default '',
  processed_at timestamptz,
  refunded_at timestamptz,
  refund_payment_id uuid,
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint refund_requests_status_check check (
    status in ('requested', 'approved', 'processing', 'refunded', 'denied', 'withdrawn')
  ),
  constraint refund_requests_destination_check check (destination in ('original', 'check'))
);

create index if not exists refund_requests_company_status_idx
  on public.refund_requests (company_id, status);

create index if not exists refund_requests_job_id_idx
  on public.refund_requests (job_id);

alter table public.refund_requests enable row level security;

drop policy if exists "company isolation" on public.refund_requests;
create policy "company isolation" on public.refund_requests
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.refund_requests to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.refund_requests';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
