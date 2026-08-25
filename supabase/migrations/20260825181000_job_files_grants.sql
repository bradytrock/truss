-- Grants and the job-files bucket, in case the table already exists but uploads still fail.

grant select, insert, update, delete on table public.job_files to authenticated;

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
