-- Private job files: optional public share links (unguessable token).
-- Signed-in company members read via /api/storage/object; anon needs a token.

alter table public.job_files
  add column if not exists share_token text;

alter table public.job_files
  add column if not exists share_token_created_at timestamptz;

update public.job_files
set share_token = null
where share_token is not null and btrim(share_token) = '';

create unique index if not exists job_files_share_token_idx
  on public.job_files (share_token)
  where share_token is not null and share_token <> '';

-- Metadata for a file opened via /share/f/{token}.
create or replace function public.shared_job_file(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := trim(coalesce(p_token, ''));
  payload jsonb;
begin
  if length(token) < 16 then
    return null;
  end if;

  select jsonb_build_object(
    'id', f.id,
    'companyId', f.company_id,
    'jobId', f.job_id,
    'name', f.name,
    'mimeType', coalesce(
      nullif(trim(coalesce(to_jsonb(f)->>'content_type', '')), ''),
      nullif(trim(coalesce(to_jsonb(f)->>'mime_type', '')), ''),
      'application/octet-stream'
    ),
    'sizeBytes', f.size_bytes,
    'storagePath', f.storage_path,
    'shareToken', f.share_token
  )
  into payload
  from public.job_files f
  where f.share_token = token
  limit 1;

  return payload;
end;
$$;

revoke all on function public.shared_job_file(text) from public;
grant execute on function public.shared_job_file(text) to anon, authenticated;

-- True when a share token (file, estimate, invoice, or page) may read this object key.
create or replace function public.storage_share_access(p_token text, p_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := trim(coalesce(p_token, ''));
  path text := trim(both '/' from coalesce(p_path, ''));
  parts text[];
  company_id uuid;
  kind text;
  job_id uuid;
  path_job text;
  ok boolean := false;
begin
  if length(token) < 6 or path = '' or position('..' in path) > 0 then
    return false;
  end if;

  parts := string_to_array(path, '/');
  if array_length(parts, 1) < 3 then
    return false;
  end if;

  -- Canonical: {companyId}/{kind}/…
  if parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    company_id := parts[1]::uuid;
    kind := parts[2];
    path_job := parts[3];
  -- Legacy: {kind}/{companyId}/…
  elsif parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    kind := parts[1];
    company_id := parts[2]::uuid;
    path_job := parts[3];
  else
    return false;
  end if;

  if kind = 'company-assets' then
    return true;
  end if;

  if kind not in ('job-files', 'job-photos') then
    return false;
  end if;

  -- Explicit file share: exact storage path.
  select true into ok
  from public.job_files f
  where f.share_token = token
    and f.storage_path = path
  limit 1;
  if coalesce(ok, false) then
    return true;
  end if;

  -- Document share: estimate / invoice / page token unlocks that job's photos & files.
  select e.job_id into job_id
  from public.estimates e
  where e.company_id = company_id
    and (
      e.share_token = token
      or coalesce(e.second_share_token, '') = token
    )
  limit 1;

  if job_id is null then
    select i.job_id into job_id
    from public.invoices i
    where i.company_id = company_id
      and i.share_token = token
    limit 1;
  end if;

  if job_id is null then
    select r.job_id into job_id
    from public.photo_reports r
    where r.company_id = company_id
      and r.share_token = token
    limit 1;
  end if;

  if job_id is null then
    return false;
  end if;

  return path_job = job_id::text;
end;
$$;

revoke all on function public.storage_share_access(text, text) from public;
grant execute on function public.storage_share_access(text, text) to anon, authenticated;
