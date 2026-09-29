-- Forecasted expenses: expected job costs that are not receipts and do not post to QuickBooks.
-- They show on the job financials under Forecasted expenses and roll into the projected column.

create table if not exists public.forecasted_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  job_id uuid references public.jobs (id) on delete set null,
  vendor text not null default '',
  account text not null default 'materials',
  amount numeric(14, 2) not null default 0,
  expected_at date not null default current_date,
  memo text not null default '',
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create unique index if not exists forecasted_expenses_company_number_idx
  on public.forecasted_expenses (company_id, number);
create index if not exists forecasted_expenses_job_id_idx
  on public.forecasted_expenses (job_id);

alter table public.forecasted_expenses enable row level security;

drop policy if exists "company isolation" on public.forecasted_expenses;
create policy "company isolation" on public.forecasted_expenses
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.forecasted_expenses to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.forecasted_expenses';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

alter table public.company_audit_events
  drop constraint if exists company_audit_events_entity_type_check;

alter table public.company_audit_events
  add constraint company_audit_events_entity_type_check
  check (entity_type in (
    'job',
    'contact',
    'opportunity',
    'photo',
    'job_file',
    'estimate',
    'estimate_file',
    'invoice',
    'invoice_file',
    'company_file',
    'payment',
    'expense',
    'forecasted_expense',
    'task',
    'schedule_event',
    'message',
    'company_settings',
    'staff',
    'team',
    'session',
    'photo_report'
  ));

notify pgrst, 'reload schema';
