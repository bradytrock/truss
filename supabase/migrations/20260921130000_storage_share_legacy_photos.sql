-- Older job photos were stored as {companyId}/{uploadId}/file.jpg
-- (uploadId is not the job id). Share links only unlocked
-- {companyId}/job-photos/{jobId}/… so those shots 401'd and showed "?"
-- on the proposal.

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
  file_name text;
  kindless text;
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

  if path_job = job_id::text then
    return true;
  end if;

  if kind = 'job-photos' then
    file_name := parts[array_length(parts, 1)];
    kindless := company_id::text || '/' || array_to_string(parts[3:array_length(parts, 1)], '/');
    select true into ok
    from public.job_photos p
    where p.job_id = job_id
      and p.deleted_at is null
      and (
        coalesce(p.storage_path, '') = path
        or coalesce(p.storage_path, '') = kindless
        or coalesce(p.image_url, '') ilike '%' || file_name || '%'
      )
    limit 1;
    return coalesce(ok, false);
  end if;

  return false;
end;
$$;

revoke all on function public.storage_share_access(text, text) from public;
grant execute on function public.storage_share_access(text, text) to anon, authenticated;
