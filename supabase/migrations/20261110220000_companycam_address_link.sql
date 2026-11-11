-- Link a CompanyCam project to the one open job at the same address.
-- The webhook calls these with its unguessable token. They never run as a logged-in user.
-- Safe to re-run.

create or replace function public.companycam_webhook_access(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.companycam_connections%rowtype;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;

  select * into v_conn
  from public.companycam_connections
  where webhook_token = trim(p_token)
    and linked = true
  limit 1;

  if not found or coalesce(trim(v_conn.access_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  return jsonb_build_object(
    'ok', true,
    'companyId', v_conn.company_id,
    'accessToken', v_conn.access_token
  );
end;
$$;

revoke all on function public.companycam_webhook_access(text) from public;
grant execute on function public.companycam_webhook_access(text) to anon, authenticated, service_role;

create or replace function public.companycam_address_candidates(
  p_token text,
  p_postal text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.companycam_connections%rowtype;
  v_postal text;
  v_jobs jsonb;
  v_count integer;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;

  v_postal := left(regexp_replace(coalesce(p_postal, ''), '[^0-9]', '', 'g'), 5);
  if length(v_postal) <> 5 then
    return jsonb_build_object('ok', true, 'complete', true, 'jobs', '[]'::jsonb);
  end if;

  select * into v_conn
  from public.companycam_connections
  where webhook_token = trim(p_token)
    and linked = true
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  with matches as (
    select
      j.id,
      j.street,
      j.city,
      j.state,
      j.postal_code,
      coalesce(l.companycam_project_id, '') as project_id,
      coalesce(l.address_line, '') as address_line
    from public.jobs j
    left join public.companycam_job_links l
      on l.company_id = j.company_id
     and l.job_id = j.id
    where j.company_id = v_conn.company_id
      and j.deleted_at is null
      and left(regexp_replace(coalesce(j.postal_code, ''), '[^0-9]', '', 'g'), 5) = v_postal
    order by j.created_at desc
    limit 201
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'street', street,
          'city', city,
          'state', state,
          'postalCode', postal_code,
          'projectId', project_id,
          'addressLine', address_line
        )
      ),
      '[]'::jsonb
    )
  into v_count, v_jobs
  from matches;

  return jsonb_build_object(
    'ok', true,
    'complete', coalesce(v_count, 0) < 201,
    'jobs', coalesce(v_jobs, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.companycam_address_candidates(text, text) from public;
grant execute on function public.companycam_address_candidates(text, text) to anon, authenticated, service_role;

create or replace function public.companycam_save_auto_link(
  p_token text,
  p_job_id uuid,
  p_project_id text,
  p_project_name text,
  p_project_url text,
  p_address_line text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.companycam_connections%rowtype;
  v_job public.jobs%rowtype;
  v_link public.companycam_job_links%rowtype;
  v_project text;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;

  v_project := trim(coalesce(p_project_id, ''));
  if v_project = '' or p_job_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_project');
  end if;

  select * into v_conn
  from public.companycam_connections
  where webhook_token = trim(p_token)
    and linked = true
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_job
  from public.jobs
  where id = p_job_id
    and company_id = v_conn.company_id
    and deleted_at is null
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'job_not_found');
  end if;

  select * into v_link
  from public.companycam_job_links
  where company_id = v_conn.company_id
    and job_id = v_job.id
  limit 1;

  if found and v_link.companycam_project_id <> v_project then
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'job_linked');
  end if;

  if found and v_link.companycam_project_id = v_project then
    update public.companycam_job_links
    set
      project_name = left(coalesce(p_project_name, ''), 500),
      project_url = coalesce(p_project_url, ''),
      address_line = left(coalesce(p_address_line, ''), 500),
      updated_at = now()
    where id = v_link.id;
    return jsonb_build_object('ok', true, 'linked', true, 'jobId', v_job.id);
  end if;

  if exists (
    select 1
    from public.companycam_job_links
    where company_id = v_conn.company_id
      and companycam_project_id = v_project
      and job_id <> v_job.id
  ) then
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'project_linked');
  end if;

  insert into public.companycam_job_links (
    company_id,
    job_id,
    companycam_project_id,
    project_name,
    project_url,
    address_line
  )
  values (
    v_conn.company_id,
    v_job.id,
    v_project,
    left(coalesce(p_project_name, ''), 500),
    coalesce(p_project_url, ''),
    left(coalesce(p_address_line, ''), 500)
  );

  return jsonb_build_object('ok', true, 'linked', true, 'jobId', v_job.id);
exception
  when unique_violation then
    if exists (
      select 1
      from public.companycam_job_links
      where company_id = v_conn.company_id
        and job_id = v_job.id
        and companycam_project_id = v_project
    ) then
      return jsonb_build_object('ok', true, 'linked', true, 'jobId', v_job.id);
    end if;
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'duplicate');
end;
$$;

revoke all on function public.companycam_save_auto_link(text, uuid, text, text, text, text) from public;
grant execute on function public.companycam_save_auto_link(text, uuid, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
