-- When a new lead’s phone matches a past client, office can route it back to
-- that project manager. If the person opening the lead keeps another assignee,
-- company admins get a Home notice and make the final call.

create table if not exists public.returning_client_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  previous_job_id uuid references public.jobs (id) on delete set null,
  previous_staff_id uuid,
  previous_staff_name text not null default '',
  previous_job_code text not null default '',
  completed_at date,
  opened_by_staff_id uuid,
  opened_by_name text not null default '',
  status text not null default 'pending',
  decided_by_staff_id uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint returning_client_leads_status_check
    check (status in ('pending', 'reassigned', 'kept'))
);

create index if not exists returning_client_leads_company_status_idx
  on public.returning_client_leads (company_id, status, created_at desc);

alter table public.returning_client_leads enable row level security;
alter table public.returning_client_leads replica identity full;

drop policy if exists "company isolation" on public.returning_client_leads;
create policy "company isolation" on public.returning_client_leads
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.returning_client_leads';
  exception
    when duplicate_object then null;
  end;
end $$;

revoke all on public.returning_client_leads from anon, public;
grant select, insert, update, delete on public.returning_client_leads to authenticated;

notify pgrst, 'reload schema';
