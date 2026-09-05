-- Attachments on an estimate: specs, insurance docs, sketches, and other files for the proposal.

create table if not exists public.estimate_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  storage_path text not null,
  url text not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists estimate_files_estimate_id_idx on public.estimate_files (estimate_id);
create index if not exists estimate_files_company_id_idx on public.estimate_files (company_id);

alter table public.estimate_files enable row level security;

drop policy if exists "company isolation" on public.estimate_files;
create policy "company isolation" on public.estimate_files
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.estimate_files to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.estimate_files';
exception
  when duplicate_object then null;
end $$;

-- Allow estimate_file rows in the company audit trail.
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
    'company_file',
    'payment',
    'expense',
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
