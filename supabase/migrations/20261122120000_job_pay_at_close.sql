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
  requested_by uuid references public.team_members (id) on delete set null,
  requested_by_name text not null default '',
  requested_at timestamptz,
  decided_by uuid references public.team_members (id) on delete set null,
  decided_by_name text not null default '',
  decided_at timestamptz,
  decision_note text not null default '',
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

-- Approving or declining a request is a company admin decision. The UI hides the controls
-- from everyone else; this trigger makes the rule hold for any client.
create or replace function public.job_pay_at_close_guard_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  decision_changed boolean;
begin
  decision_changed :=
    tg_op = 'INSERT'
      and (new.status in ('approved', 'declined') or new.decided_at is not null)
    or tg_op = 'UPDATE'
      and (
        (new.status in ('approved', 'declined') and new.status is distinct from old.status)
        or new.decided_at is distinct from old.decided_at
        or new.decided_by is distinct from old.decided_by
      );
  if decision_changed and auth.uid() is not null and not public.current_is_company_admin() then
    raise exception 'Only a company admin can approve or decline a pay-at-close request.'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'screening' and old.decided_at is null
     and new.status in ('in_progress', 'awaiting_close', 'paid') then
    raise exception 'A pay-at-close request must be approved by a company admin before work starts.'
      using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function public.job_pay_at_close_guard_decision() from public;

drop trigger if exists job_pay_at_close_guard_decision on public.job_pay_at_close;
create trigger job_pay_at_close_guard_decision
  before insert or update on public.job_pay_at_close
  for each row execute function public.job_pay_at_close_guard_decision();

do $$
begin
  execute 'alter publication supabase_realtime add table public.job_pay_at_close';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
