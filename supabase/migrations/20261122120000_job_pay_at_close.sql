-- Pay at Close: repairs completed before a home sale, paid from seller proceeds at closing.
-- One row per job. Public property record, liens, checklist, and the risk report live in jsonb
-- so a round trip saves the whole underwriting file.

create table if not exists public.job_pay_at_close (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null default 'screening',
  contract_value numeric(14, 2) not null default 0,
  deposit_amount numeric(14, 2) not null default 0,
  expected_close_date date,
  listing_status text not null default '',
  list_price numeric(14, 2) not null default 0,
  contract_price numeric(14, 2) not null default 0,
  seller_concessions numeric(14, 2) not null default 0,
  title_company text not null default '',
  escrow_officer text not null default '',
  escrow_email text not null default '',
  escrow_phone text not null default '',
  escrow_file_number text not null default '',
  listing_agent text not null default '',
  signer_names text not null default '',
  property jsonb,
  liens jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  report jsonb,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  constraint job_pay_at_close_job_id_key unique (job_id),
  constraint job_pay_at_close_status_check check (
    status in (
      'screening',
      'approved',
      'declined',
      'in_progress',
      'awaiting_close',
      'paid',
      'fell_through'
    )
  )
);

create index if not exists job_pay_at_close_company_id_idx on public.job_pay_at_close (company_id);
create index if not exists job_pay_at_close_status_idx on public.job_pay_at_close (company_id, status);
create index if not exists job_pay_at_close_close_date_idx on public.job_pay_at_close (company_id, expected_close_date);

alter table public.job_pay_at_close enable row level security;

drop policy if exists "company isolation" on public.job_pay_at_close;
create policy "company isolation" on public.job_pay_at_close
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.job_pay_at_close to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.job_pay_at_close';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
