-- Commission closeout: a project manager submits the job, accounting reviews the
-- commission sheet against QuickBooks, then releases it for payout.

create table if not exists public.commission_closeouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null default 'submitted',
  submitted_by text not null default '',
  submitted_by_name text not null default '',
  submitted_at timestamptz not null default now(),
  accounting_note text not null default '',
  reviewed_by text not null default '',
  reviewed_by_name text not null default '',
  reviewed_at timestamptz,
  released_to_staff_id text not null default '',
  released_to_name text not null default '',
  payout_marked_by text not null default '',
  payout_marked_by_name text not null default '',
  payout_marked_at timestamptz,
  qb_lines jsonb not null default '[]'::jsonb,
  splits jsonb not null default '[]'::jsonb,
  variance_ack boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  constraint commission_closeouts_job_id_key unique (job_id),
  constraint commission_closeouts_status_check check (
    status in ('submitted', 'returned', 'released', 'payout')
  )
);

create index if not exists commission_closeouts_company_status_idx
  on public.commission_closeouts (company_id, status);

alter table public.commission_closeouts enable row level security;

drop policy if exists "company isolation" on public.commission_closeouts;
create policy "company isolation" on public.commission_closeouts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.commission_closeouts to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.commission_closeouts';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
