-- Seat-scoped book lookups for the hosted Cassio assistant.
-- The MCP bearer is the seat. ZeroSettle does not pass the texter's phone.
-- Writes stay off. The office client line is not involved.

alter table public.cassio_line_secrets
  add column if not exists mcp_token text not null default '';

alter table public.cassio_lines
  add column if not exists book_ready boolean not null default false;

create or replace function public.cassio_line_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_line public.cassio_lines%rowtype;
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  select * into v_line from public.cassio_lines where staff_id = v_staff;
  if not found then
    return jsonb_build_object('ok', true, 'linked', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'linked', true,
    'lineId', v_line.line_id,
    'lineNumber', v_line.line_number,
    'groupId', v_line.group_id,
    'yourNumber', v_line.your_number,
    'active', v_line.active,
    'managedBy', v_line.managed_by,
    'profileName', v_line.profile_name,
    'tokenHint', v_line.token_hint,
    'creditsLeft', v_line.credits_left,
    'crmUpdates', v_line.crm_updates,
    'groupMessages', v_line.group_messages,
    'bookReady', v_line.book_ready,
    'linkedAt', v_line.linked_at
  );
end;
$$;

create or replace function public.cassio_line_set_book(p_mcp_token text, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_token text := trim(coalesce(p_mcp_token, ''));
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  if not exists (select 1 from public.cassio_lines where staff_id = v_staff) then
    return jsonb_build_object('ok', false, 'error', 'Connect the number first.');
  end if;
  if v_token <> '' then
    update public.cassio_line_secrets
       set mcp_token = v_token
     where staff_id = v_staff;
  end if;
  update public.cassio_lines
     set book_ready = coalesce(p_ready, false),
         updated_at = now()
   where staff_id = v_staff;
  return public.cassio_line_status();
end;
$$;

-- Rows this seat may read. Unknown tokens return nothing.
create or replace function public.cassio_book_rows(p_token text)
returns table (
  seat_name text,
  contact_name text,
  second_name text,
  estimate_number text,
  estimate_name text,
  estimate_status text,
  sent_at timestamptz,
  job_code text,
  address text,
  opens integer,
  last_opened_at timestamptz
)
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
begin
  if length(trim(coalesce(p_token, ''))) < 32 then
    return;
  end if;

  select l.staff_id, l.company_id, m.role::text, coalesce(m.name, '')
    into v_staff, v_company, v_role, v_seat
  from public.cassio_line_secrets s
  join public.cassio_lines l on l.staff_id = s.staff_id
  join public.team_members m on m.id = l.staff_id
  where s.mcp_token = trim(p_token)
  limit 1;

  if v_staff is null then
    return;
  end if;

  v_admin := v_role in ('company_admin', 'director');

  return query
  select
    v_seat,
    coalesce(c.name, ''),
    coalesce(c2.name, ''),
    e.number,
    e.name,
    e.status::text,
    e.sent_at,
    coalesce(j.code, ''),
    trim(both ' ' from concat_ws(', ',
      nullif(trim(coalesce(nullif(e.street, ''), j.street, '')), ''),
      nullif(trim(concat_ws(' ',
        coalesce(nullif(e.city, ''), j.city, ''),
        coalesce(nullif(e.state, ''), j.state, '')
      )), ''),
      nullif(trim(coalesce(nullif(e.postal_code, ''), j.postal_code, '')), '')
    )),
    coalesce(opened.opens, 0),
    opened.last_opened_at
  from public.estimates e
  left join public.contacts c on c.id = e.contact_id
  left join public.contacts c2 on c2.id = e.second_contact_id
  left join public.jobs j on j.id = e.job_id and j.deleted_at is null
  left join public.opportunities o on o.id = e.opportunity_id
  left join lateral (
    select count(*)::integer as opens, max(ev.created_at) as last_opened_at
    from public.estimate_signature_events ev
    where ev.estimate_id = e.id
      and ev.kind = 'opened'
  ) opened on true
  where e.company_id = v_company
    and e.archived_at is null
    and (
      v_admin
      or j.owner_staff_id = v_staff
      or o.owner_staff_id = v_staff
      or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
      or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
    );
end;
$$;

create or replace function public.cassio_estimate_activity(p_token text, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text;
  v_seat text;
  v_matches jsonb;
begin
  if length(trim(coalesce(p_token, ''))) < 32
     or not exists (
       select 1 from public.cassio_line_secrets s where s.mcp_token = trim(p_token)
     ) then
    return jsonb_build_object('ok', false, 'error', 'This number is not connected to a Truss book.');
  end if;

  v_query := trim(regexp_replace(coalesce(p_query, ''), '[%_\\]', '', 'g'));
  if length(v_query) < 2 then
    return jsonb_build_object('ok', true, 'seat', '', 'matches', '[]'::jsonb);
  end if;

  select r.seat_name into v_seat from public.cassio_book_rows(trim(p_token)) r limit 1;

  select coalesce(jsonb_agg(item order by opened_at desc nulls last), '[]'::jsonb)
    into v_matches
  from (
    select jsonb_build_object(
      'contact', case when r.contact_name <> '' then r.contact_name else r.second_name end,
      'estimate', r.estimate_number,
      'name', r.estimate_name,
      'status', r.estimate_status,
      'sentAt', r.sent_at,
      'job', r.job_code,
      'address', r.address,
      'opens', r.opens,
      'lastOpenedAt', r.last_opened_at
    ) as item,
    r.last_opened_at as opened_at
    from public.cassio_book_rows(trim(p_token)) r
    where r.contact_name ilike '%' || v_query || '%'
       or r.second_name ilike '%' || v_query || '%'
       or r.estimate_number ilike '%' || v_query || '%'
       or r.estimate_name ilike '%' || v_query || '%'
       or r.job_code ilike '%' || v_query || '%'
       or r.address ilike '%' || v_query || '%'
    order by r.last_opened_at desc nulls last, r.sent_at desc nulls last
    limit 8
  ) found;

  return jsonb_build_object('ok', true, 'seat', coalesce(v_seat, ''), 'matches', v_matches);
end;
$$;

create or replace function public.cassio_recent_updates(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_seat text;
  v_matches jsonb;
begin
  if length(trim(coalesce(p_token, ''))) < 32
     or not exists (
       select 1 from public.cassio_line_secrets s where s.mcp_token = trim(p_token)
     ) then
    return jsonb_build_object('ok', false, 'error', 'This number is not connected to a Truss book.');
  end if;

  select r.seat_name into v_seat from public.cassio_book_rows(trim(p_token)) r limit 1;

  select coalesce(jsonb_agg(item order by opened_at desc), '[]'::jsonb)
    into v_matches
  from (
    select jsonb_build_object(
      'contact', case when r.contact_name <> '' then r.contact_name else r.second_name end,
      'estimate', r.estimate_number,
      'name', r.estimate_name,
      'status', r.estimate_status,
      'sentAt', r.sent_at,
      'job', r.job_code,
      'address', r.address,
      'opens', r.opens,
      'lastOpenedAt', r.last_opened_at
    ) as item,
    r.last_opened_at as opened_at
    from public.cassio_book_rows(trim(p_token)) r
    where r.last_opened_at > now() - interval '14 days'
    order by r.last_opened_at desc
    limit 8
  ) found;

  return jsonb_build_object('ok', true, 'seat', coalesce(v_seat, ''), 'matches', v_matches);
end;
$$;

-- Service role only. Returns the ZeroSettle API token so the server can text the seat.
create or replace function public.cassio_line_send_target(p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text;
  v_line_id text;
begin
  select s.api_token, l.line_id
    into v_token, v_line_id
  from public.cassio_lines l
  join public.cassio_line_secrets s on s.staff_id = l.staff_id
  where l.staff_id = p_staff_id
    and l.managed_by = 'zerosettle'
    and s.api_token <> '';
  if coalesce(v_token, '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'apiToken', v_token, 'lineId', coalesce(v_line_id, ''));
end;
$$;

revoke all on function public.cassio_line_set_book(text, boolean) from public, anon;
grant execute on function public.cassio_line_set_book(text, boolean) to authenticated, service_role;

revoke all on function public.cassio_book_rows(text) from public, anon, authenticated;
grant execute on function public.cassio_book_rows(text) to service_role;

revoke all on function public.cassio_estimate_activity(text, text) from public;
grant execute on function public.cassio_estimate_activity(text, text) to anon, authenticated, service_role;

revoke all on function public.cassio_recent_updates(text) from public;
grant execute on function public.cassio_recent_updates(text) to anon, authenticated, service_role;

revoke all on function public.cassio_line_send_target(uuid) from public, anon, authenticated;
grant execute on function public.cassio_line_send_target(uuid) to service_role;

notify pgrst, 'reload schema';
