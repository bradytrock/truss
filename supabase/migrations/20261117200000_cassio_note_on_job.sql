-- A note Cassio logs for a person belongs on that person's open job.
-- The contact card is only used when they have no open job.

create or replace function public.cassio_open_job(p_company uuid, p_client uuid)
returns table (job_id uuid, job_code text)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, coalesce(j.code, '')
  from public.jobs j
  where j.company_id = p_company
    and j.client_id = p_client
    and j.deleted_at is null
    and j.status in ('precon', 'in_progress', 'punch', 'on_hold')
  order by j.start_date desc nulls last, j.created_at desc
  limit 1;
$$;

create or replace function public.cassio_visible_client(p_token text, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_company uuid;
  v_role text;
  v_seat text;
  v_admin boolean;
  v_query text;
  v_count integer;
  v_id uuid;
  v_name text;
  v_job uuid;
  v_code text;
begin
  select l.staff_id, l.company_id, m.role::text, coalesce(m.name, '')
    into v_staff, v_company, v_role, v_seat
  from public.cassio_line_secrets s
  join public.cassio_lines l on l.staff_id = s.staff_id
  join public.team_members m on m.id = l.staff_id
  where s.mcp_token = trim(coalesce(p_token, ''))
  limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'This number is not connected to a Truss book.');
  end if;
  v_admin := v_role in ('company_admin', 'director');
  v_query := trim(regexp_replace(coalesce(p_query, ''), '[%_\\]', '', 'g'));
  if length(v_query) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Name the client.');
  end if;

  select count(*) into v_count
  from public.clients c
  where c.company_id = v_company
    and (
      c.name ilike '%' || v_query || '%'
      or exists (
        select 1 from public.contacts ct
        where ct.client_id = c.id and ct.name ilike '%' || v_query || '%'
      )
    )
    and (
      v_admin
      or exists (
        select 1 from public.jobs j
        where j.client_id = c.id
          and j.deleted_at is null
          and (
            j.owner_staff_id = v_staff
            or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
            or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
          )
      )
      or exists (
        select 1 from public.opportunities o
        where o.client_id = c.id and o.owner_staff_id = v_staff
      )
    );

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No client in this book matched.');
  end if;
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'More than one client matched. Use a fuller name.');
  end if;

  select c.id, c.name into v_id, v_name
  from public.clients c
  where c.company_id = v_company
    and (
      c.name ilike '%' || v_query || '%'
      or exists (
        select 1 from public.contacts ct
        where ct.client_id = c.id and ct.name ilike '%' || v_query || '%'
      )
    )
    and (
      v_admin
      or exists (
        select 1 from public.jobs j
        where j.client_id = c.id
          and j.deleted_at is null
          and (
            j.owner_staff_id = v_staff
            or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
            or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
          )
      )
      or exists (
        select 1 from public.opportunities o
        where o.client_id = c.id and o.owner_staff_id = v_staff
      )
    )
  limit 1;

  select job_id, job_code into v_job, v_code from public.cassio_open_job(v_company, v_id);

  return jsonb_build_object(
    'ok', true,
    'clientId', v_id,
    'name', v_name,
    'openJobId', v_job,
    'openJobCode', coalesce(v_code, '')
  );
end;
$$;

create or replace function public.cassio_action_commit(p_token text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_company uuid;
  v_seat text;
  v_pending public.cassio_pending_actions%rowtype;
  v_kind text;
  v_body text;
  v_client uuid;
  v_job uuid;
  v_code text;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_summary text;
begin
  select l.staff_id, l.company_id, coalesce(m.name, 'Cassio')
    into v_staff, v_company, v_seat
  from public.cassio_line_secrets s
  join public.cassio_lines l on l.staff_id = s.staff_id
  join public.team_members m on m.id = l.staff_id
  where s.mcp_token = trim(coalesce(p_token, ''))
  limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'This number is not connected to a Truss book.');
  end if;

  select * into v_pending from public.cassio_pending_actions where staff_id = v_staff;
  if not found or v_pending.created_at < now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'error', 'Nothing is waiting for a YES.');
  end if;
  if v_pending.kind <> coalesce(p_kind, '') then
    return jsonb_build_object('ok', false, 'error', 'Reply YES to the action that is waiting.');
  end if;

  if v_pending.kind = 'communication' then
    v_kind := lower(coalesce(v_pending.payload->>'kind', 'note'));
    if v_kind not in ('note', 'call', 'text') then
      v_kind := 'note';
    end if;
    v_body := trim(coalesce(v_pending.payload->>'body', ''));
    v_client := nullif(v_pending.payload->>'clientId', '')::uuid;
    if v_client is null or v_body = '' then
      return jsonb_build_object('ok', false, 'error', 'The communication was incomplete.');
    end if;
    v_job := nullif(v_pending.payload->>'jobId', '')::uuid;
    if v_job is not null and not exists (
      select 1 from public.jobs j
      where j.id = v_job
        and j.company_id = v_company
        and j.deleted_at is null
        and j.status in ('precon', 'in_progress', 'punch', 'on_hold')
    ) then
      v_job := null;
    end if;
    if v_job is null then
      select job_id into v_job from public.cassio_open_job(v_company, v_client);
    end if;
    if v_job is not null then
      select coalesce(j.code, '') into v_code from public.jobs j where j.id = v_job;
      insert into public.activities (company_id, entity_type, entity_id, type, body, author)
      values (v_company, 'job', v_job, v_kind::public.activity_type, v_body, v_seat);
      v_summary := 'Saved the ' || v_kind || ' on ' || coalesce(nullif(v_code, ''), 'the open job') || '.';
    else
      insert into public.activities (company_id, entity_type, entity_id, type, body, author)
      values (v_company, 'client', v_client, v_kind::public.activity_type, v_body, v_seat);
      v_summary := 'Saved the ' || v_kind || ' on ' || coalesce(v_pending.payload->>'name', 'the client') || '.';
    end if;
  elsif v_pending.kind = 'appointment' then
    v_job := nullif(v_pending.payload->>'jobId', '')::uuid;
    v_title := trim(coalesce(v_pending.payload->>'title', ''));
    begin
      v_start := (v_pending.payload->>'startsAt')::timestamptz;
      v_end := coalesce(nullif(v_pending.payload->>'endsAt', '')::timestamptz, v_start + interval '1 hour');
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'Give a start time.');
    end;
    if v_job is null or v_title = '' then
      return jsonb_build_object('ok', false, 'error', 'The appointment was incomplete.');
    end if;
    insert into public.schedule_events (
      company_id, title, kind, starts_at, ends_at, location, assignee, job_id, client_id, opportunity_id, notes
    )
    values (
      v_company, v_title, 'meeting', v_start, v_end,
      coalesce(v_pending.payload->>'location', ''), v_seat, v_job,
      nullif(v_pending.payload->>'clientId', '')::uuid,
      nullif(v_pending.payload->>'opportunityId', '')::uuid,
      ''
    );
    v_summary := 'Booked ' || v_title || ' on ' || coalesce(nullif(v_pending.payload->>'code', ''), 'the job') || '.';
  elsif v_pending.kind = 'seed' then
    v_summary := trim(coalesce(v_pending.payload->>'line', ''));
    if v_summary = '' or v_summary ~* '\$[[:space:]]?[[:digit:]]|contract value|balance due|invoice total' then
      delete from public.cassio_pending_actions where staff_id = v_staff;
      return jsonb_build_object('ok', false, 'error', 'That update was not posted.');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'That action is not available.');
  end if;

  delete from public.cassio_pending_actions where staff_id = v_staff;
  return jsonb_build_object('ok', true, 'kind', v_pending.kind, 'summary', v_summary);
end;
$$;

revoke all on function public.cassio_open_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cassio_open_job(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
