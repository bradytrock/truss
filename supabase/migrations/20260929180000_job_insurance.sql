-- Job insurance: carrier, claim money, supplements, and insurance checks.
-- One row per job. Supplements and checks live in jsonb so a round trip saves the whole claim.

create table if not exists public.job_insurance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  carrier text not null default '',
  claim_number text not null default '',
  policy_number text not null default '',
  date_of_loss date,
  peril text not null default '',
  status text not null default 'intake',
  deductible numeric(14, 2) not null default 0,
  rcv numeric(14, 2) not null default 0,
  acv numeric(14, 2) not null default 0,
  depreciation numeric(14, 2) not null default 0,
  recoverable boolean not null default true,
  overhead_profit numeric(14, 2) not null default 0,
  mortgage_company text not null default '',
  loan_number text not null default '',
  adjuster_contact_id uuid references public.contacts (id) on delete set null,
  notes text not null default '',
  supplements jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint job_insurance_job_id_key unique (job_id),
  constraint job_insurance_status_check check (
    status in (
      'intake',
      'inspected',
      'estimate_sent',
      'supplementing',
      'approved',
      'depreciation',
      'closed',
      'denied'
    )
  )
);

create index if not exists job_insurance_company_id_idx on public.job_insurance (company_id);
create index if not exists job_insurance_status_idx on public.job_insurance (company_id, status);

alter table public.job_insurance enable row level security;

drop policy if exists "company isolation" on public.job_insurance;
create policy "company isolation" on public.job_insurance
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.job_insurance to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.job_insurance';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
