-- Company-wide audit trail with before/after snapshots and revert markers.
-- Append-only history; revert marks the original row and inserts a compensating event.
-- Safe to re-run.

create table if not exists public.company_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor text not null default '',
  actor_staff_id uuid null,
  summary text not null default '',
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  changed_fields text[] not null default '{}'::text[],
  related_job_id uuid null,
  related_opportunity_id uuid null,
  reverted_at timestamptz null,
  reverted_by text not null default '',
  revert_of_event_id uuid null references public.company_audit_events (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint company_audit_events_action_check
    check (action in (
      'created',
      'updated',
      'deleted',
      'restored',
      'status_changed',
      'reverted'
    )),
  constraint company_audit_events_entity_type_check
    check (entity_type in (
      'job',
      'contact',
      'opportunity',
      'photo',
      'job_file',
      'estimate',
      'invoice',
      'company_file'
    ))
);

create index if not exists company_audit_events_company_created_idx
  on public.company_audit_events (company_id, created_at desc);

create index if not exists company_audit_events_entity_created_idx
  on public.company_audit_events (entity_type, entity_id, created_at desc);

create index if not exists company_audit_events_job_created_idx
  on public.company_audit_events (related_job_id, created_at desc);

alter table public.company_audit_events enable row level security;

drop policy if exists "company isolation" on public.company_audit_events;
create policy "company isolation" on public.company_audit_events
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update on table public.company_audit_events to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.company_audit_events';
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
