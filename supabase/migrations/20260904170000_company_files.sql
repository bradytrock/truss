-- Company file directory: warranties, product sheets, and other office templates.
-- Copies attach onto jobs as normal job_files (independent blobs).

create table if not exists public.company_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  category text not null default 'other',
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null,
  url text not null,
  notes text not null default '',
  uploaded_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_files_company_id_idx
  on public.company_files (company_id, created_at desc);

alter table public.company_files enable row level security;

drop policy if exists "company isolation" on public.company_files;
create policy "company isolation" on public.company_files
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.company_files to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.company_files';
exception
  when duplicate_object then null;
end $$;
