-- Attachments on a job: PDFs, insurance docs, and other files from the field.

create table if not exists public.job_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  storage_path text not null,
  url text not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists job_files_job_id_idx on public.job_files (job_id);
create index if not exists job_files_company_id_idx on public.job_files (company_id);

alter table public.job_files enable row level security;

drop policy if exists "company isolation" on public.job_files;
create policy "company isolation" on public.job_files
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.job_files to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.job_files';
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-files',
  'job-files',
  true,
  26214400,
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read job files" on storage.objects;
create policy "public read job files"
on storage.objects for select
to public
using (bucket_id = 'job-files');

drop policy if exists "company job files" on storage.objects;
create policy "company job files"
on storage.objects for all to authenticated
using (
  bucket_id = 'job-files'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'job-files'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);
