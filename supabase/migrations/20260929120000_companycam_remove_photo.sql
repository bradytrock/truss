-- Soft-delete a job photo when CompanyCam deletes it on a linked project.
create or replace function public.companycam_remove_photo(
  p_token text,
  p_project_id text,
  p_photo_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.companycam_connections%rowtype;
  v_photo public.job_photos%rowtype;
  v_link public.companycam_job_links%rowtype;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;
  if coalesce(trim(p_photo_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_photo');
  end if;

  select * into v_conn
  from public.companycam_connections
  where webhook_token = trim(p_token)
    and linked = true
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_photo
  from public.job_photos
  where company_id = v_conn.company_id
    and companycam_photo_id = trim(p_photo_id)
    and deleted_at is null
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'not_found');
  end if;

  if coalesce(trim(p_project_id), '') <> '' then
    select * into v_link
    from public.companycam_job_links
    where company_id = v_conn.company_id
      and job_id = v_photo.job_id
      and companycam_project_id = trim(p_project_id)
    limit 1;
    if not found then
      return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'project_not_linked');
    end if;
  end if;

  update public.job_photos
  set deleted_at = now(), deleted_by = 'CompanyCam'
  where id = v_photo.id;

  update public.jobs
  set primary_photo_id = null
  where id = v_photo.job_id
    and primary_photo_id = v_photo.id;

  update public.companycam_job_links
  set last_synced_at = now(), updated_at = now()
  where company_id = v_conn.company_id
    and job_id = v_photo.job_id;

  return jsonb_build_object('ok', true, 'removed', true, 'photoId', v_photo.id);
end;
$$;

revoke all on function public.companycam_remove_photo(text, text, text) from public;
grant execute on function public.companycam_remove_photo(text, text, text) to anon, authenticated, service_role;
