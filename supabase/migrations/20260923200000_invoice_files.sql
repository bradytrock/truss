-- Attachments on an invoice: specs, insurance docs, and files copied from the company directory.

create table if not exists public.invoice_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  storage_path text not null,
  url text not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists invoice_files_invoice_id_idx on public.invoice_files (invoice_id);
create index if not exists invoice_files_company_id_idx on public.invoice_files (company_id);

alter table public.invoice_files enable row level security;

drop policy if exists "company isolation" on public.invoice_files;
create policy "company isolation" on public.invoice_files
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.invoice_files to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.invoice_files';
exception
  when duplicate_object then null;
end $$;

-- Allow invoice_file rows in the company audit trail.
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
