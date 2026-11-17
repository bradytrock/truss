-- Cassio writes and the one verified Seeds group.
-- Book facts and money stay in a private text with the seat.
-- A lead update posts only to the chat_id saved after the verification phrase.

alter table public.cassio_lines
  add column if not exists seed_chat_id text not null default '',
  add column if not exists seed_verify_code text not null default '',
  add column if not exists seed_verified_at timestamptz;

create table if not exists public.cassio_pending_actions (
  staff_id uuid primary key references public.cassio_lines (staff_id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cassio_seed_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  skipped boolean not null default false
);

alter table public.cassio_pending_actions enable row level security;
alter table public.cassio_seed_outbox enable row level security;
revoke all on public.cassio_pending_actions from public, anon, authenticated;
revoke all on public.cassio_seed_outbox from public, anon, authenticated;

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
    'seedVerified', v_line.seed_chat_id <> '',
    'seedPhrase', case when v_line.seed_verify_code <> '' then 'Cassio seed check ' || v_line.seed_verify_code else '' end,
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
         crm_updates = case when coalesce(p_ready, false) then true else crm_updates end,
         updated_at = now()
   where staff_id = v_staff;
  return public.cassio_line_status();
end;
$$;

create or replace function public.cassio_mcp_context(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_phone text;
  v_your text;
  v_token text;
  v_line text;
  v_chat text;
begin
  if length(trim(coalesce(p_token, ''))) < 32 then
    return jsonb_build_object('ok', false);
  end if;
  select l.staff_id, coalesce(m.phone, ''), l.your_number, s.api_token, l.line_id, l.seed_chat_id
    into v_staff, v_phone, v_your, v_token, v_line, v_chat
  from public.cassio_line_secrets s
  join public.cassio_lines l on l.staff_id = s.staff_id
  join public.team_members m on m.id = l.staff_id
  where s.mcp_token = trim(p_token)
  limit 1;
  if v_staff is null or coalesce(v_token, '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'staffId', v_staff,
    'ownerPhones', jsonb_build_array(v_phone, v_your),
    'apiToken', v_token,
    'lineId', coalesce(v_line, ''),
    'seedChatId', coalesce(v_chat, '')
  );
end;
$$;

create or replace function public.cassio_seed_issue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  if not exists (select 1 from public.cassio_lines where staff_id = v_staff) then
    return jsonb_build_object('ok', false, 'error', 'Connect the number first.');
  end if;
  update public.cassio_lines
     set seed_verify_code = v_code,
         updated_at = now()
   where staff_id = v_staff;
  return public.cassio_line_status();
end;
$$;

create or replace function public.cassio_seed_pending()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_code text;
  v_token text;
  v_line text;
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  select l.seed_verify_code, s.api_token, l.line_id
    into v_code, v_token, v_line
  from public.cassio_lines l
  join public.cassio_line_secrets s on s.staff_id = l.staff_id
  where l.staff_id = v_staff;
  if coalesce(v_code, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Create a verification phrase first.');
  end if;
  return jsonb_build_object('ok', true, 'code', v_code, 'apiToken', v_token, 'lineId', coalesce(v_line, ''));
end;
$$;

create or replace function public.cassio_seed_save(p_chat_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_chat text := trim(coalesce(p_chat_id, ''));
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  if v_chat = '' or position(';' in v_chat) = 0 then
    return jsonb_build_object('ok', false, 'error', 'That was not a group.');
  end if;
  update public.cassio_lines
     set seed_chat_id = v_chat,
         seed_verify_code = '',
         seed_verified_at = now(),
         group_messages = true,
         updated_at = now()
   where staff_id = v_staff
     and seed_verify_code <> '';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Create a verification phrase first.');
  end if;
  return public.cassio_line_status();
end;
$$;

create or replace function public.cassio_seed_clear()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  update public.cassio_lines
     set seed_chat_id = '',
         seed_verify_code = '',
         seed_verified_at = null,
         group_messages = false,
         updated_at = now()
   where staff_id = v_staff;
  return public.cassio_line_status();
end;
$$;

create or replace function public.cassio_action_remember(
  p_token text,
  p_kind text,
  p_payload jsonb,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
begin
  select l.staff_id into v_staff
  from public.cassio_line_secrets s
  join public.cassio_lines l on l.staff_id = s.staff_id
  where s.mcp_token = trim(coalesce(p_token, ''))
  limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'This number is not connected to a Truss book.');
  end if;
  if p_kind not in ('communication', 'appointment', 'seed') then
    return jsonb_build_object('ok', false, 'error', 'That action is not available.');
  end if;
  insert into public.cassio_pending_actions (staff_id, kind, payload, summary, created_at)
  values (v_staff, p_kind, coalesce(p_payload, '{}'::jsonb), left(coalesce(p_summary, ''), 400), now())
  on conflict (staff_id) do update
    set kind = excluded.kind,
        payload = excluded.payload,
        summary = excluded.summary,
        created_at = now();
  return jsonb_build_object('ok', true, 'summary', left(coalesce(p_summary, ''), 400));
end;
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

  return jsonb_build_object('ok', true, 'clientId', v_id, 'name', v_name);
end;
$$;

create or replace function public.cassio_visible_job(p_token text, p_query text)
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
  v_job public.jobs%rowtype;
  v_contact text;
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
    return jsonb_build_object('ok', false, 'error', 'Name the job.');
  end if;

  select count(*) into v_count
  from public.jobs j
  left join public.contacts ct on ct.id = j.primary_contact_id
  where j.company_id = v_company
    and j.deleted_at is null
    and (
      j.name ilike '%' || v_query || '%'
      or j.code ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (
      v_admin
      or j.owner_staff_id = v_staff
      or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
      or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
    );

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No job in this book matched.');
  end if;
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'More than one job matched. Use the job code.');
  end if;

  select j.* into v_job
  from public.jobs j
  left join public.contacts ct on ct.id = j.primary_contact_id
  where j.company_id = v_company
    and j.deleted_at is null
    and (
      j.name ilike '%' || v_query || '%'
      or j.code ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (
      v_admin
      or j.owner_staff_id = v_staff
      or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
      or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
    )
  limit 1;

  select ct.name into v_contact from public.contacts ct where ct.id = v_job.primary_contact_id;
  return jsonb_build_object(
    'ok', true,
    'jobId', v_job.id,
    'code', v_job.code,
    'name', v_job.name,
    'contact', coalesce(v_contact, ''),
    'clientId', v_job.client_id,
    'opportunityId', v_job.opportunity_id,
    'location', v_job.location
  );
end;
$$;

create or replace function public.cassio_lead_status(p_token text, p_query text)
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
  v_name text;
  v_stage text;
  v_where text;
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
    return jsonb_build_object('ok', false, 'error', 'Name the lead.');
  end if;

  select count(*) into v_count
  from public.opportunities o
  left join public.contacts ct on ct.id = o.primary_contact_id
  where o.company_id = v_company
    and (
      o.name ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (v_admin or o.owner_staff_id = v_staff);

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No lead in this book matched.');
  end if;
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'More than one lead matched. Use a fuller name.');
  end if;

  select coalesce(nullif(ct.name, ''), o.name), o.stage::text,
         trim(both ' ' from concat_ws(', ',
           nullif(trim(o.street), ''),
           nullif(trim(concat_ws(' ', o.city, o.state)), '')
         ))
    into v_name, v_stage, v_where
  from public.opportunities o
  left join public.contacts ct on ct.id = o.primary_contact_id
  where o.company_id = v_company
    and (
      o.name ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (v_admin or o.owner_staff_id = v_staff)
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'name', v_name,
    'stage', replace(v_stage, '_', ' '),
    'where', coalesce(v_where, '')
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
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (v_company, 'client', v_client, v_kind::public.activity_type, v_body, v_seat);
    v_summary := 'Saved the ' || v_kind || ' on ' || coalesce(v_pending.payload->>'name', 'the client') || '.';
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

create or replace function public.cassio_seed_target(p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text;
  v_line text;
  v_chat text;
begin
  select s.api_token, l.line_id, l.seed_chat_id
    into v_token, v_line, v_chat
  from public.cassio_lines l
  join public.cassio_line_secrets s on s.staff_id = l.staff_id
  where l.staff_id = p_staff_id
    and l.seed_chat_id <> ''
    and s.api_token <> '';
  if coalesce(v_chat, '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'apiToken', v_token, 'lineId', coalesce(v_line, ''), 'chatId', v_chat);
end;
$$;

create or replace function public.enqueue_cassio_seed_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_where text;
  v_body text;
begin
  if tg_op <> 'UPDATE' or new.stage is not distinct from old.stage then
    return new;
  end if;
  if new.owner_staff_id is null then
    return new;
  end if;
  select coalesce(nullif(ct.name, ''), new.name)
    into v_name
  from public.contacts ct
  where ct.id = new.primary_contact_id;
  if not found then
    v_name := new.name;
  end if;
  v_where := trim(both ' ' from concat_ws(', ',
    nullif(trim(new.street), ''),
    nullif(trim(concat_ws(' ', new.city, new.state)), '')
  ));

  v_body := trim(both ' ' from concat_ws(' · ',
    'Lead update: ' || coalesce(v_name, 'A lead'),
    replace(new.stage::text, '_', ' '),
    nullif(v_where, '')
  ));
  if v_body ~* '\$[[:space:]]?[[:digit:]]|contract value|balance due|invoice total' then
    return new;
  end if;

  insert into public.cassio_seed_outbox (company_id, staff_id, body)
  values (new.company_id, new.owner_staff_id, v_body);
  return new;
end;
$$;

drop trigger if exists opportunities_cassio_seed_status on public.opportunities;
create trigger opportunities_cassio_seed_status
  after update of stage on public.opportunities
  for each row execute function public.enqueue_cassio_seed_status();

create or replace function public.cassio_seed_outbox_claim()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  update public.cassio_seed_outbox o
     set skipped = true,
         sent_at = now()
   where o.sent_at is null
     and not exists (
       select 1 from public.cassio_lines l
       where l.staff_id = o.staff_id and l.seed_chat_id <> ''
     );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', picked.id,
    'body', picked.body,
    'apiToken', picked.api_token,
    'lineId', picked.line_id,
    'chatId', picked.seed_chat_id
  )), '[]'::jsonb)
    into v_rows
  from (
    select o.id, o.body, s.api_token, l.line_id, l.seed_chat_id
    from public.cassio_seed_outbox o
    join public.cassio_lines l on l.staff_id = o.staff_id and l.seed_chat_id <> ''
    join public.cassio_line_secrets s on s.staff_id = l.staff_id and s.api_token <> ''
    where o.sent_at is null
      and o.skipped = false
    order by o.created_at
    limit 20
  ) picked;

  return v_rows;
end;
$$;

create or replace function public.cassio_seed_outbox_mark(p_id uuid, p_sent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cassio_seed_outbox
     set sent_at = now(),
         skipped = not coalesce(p_sent, false)
   where id = p_id;
end;
$$;

revoke all on function public.cassio_mcp_context(text) from public;
grant execute on function public.cassio_mcp_context(text) to anon, authenticated, service_role;

revoke all on function public.cassio_seed_issue() from public, anon;
grant execute on function public.cassio_seed_issue() to authenticated, service_role;

revoke all on function public.cassio_seed_pending() from public, anon;
grant execute on function public.cassio_seed_pending() to authenticated, service_role;

revoke all on function public.cassio_seed_save(text) from public, anon;
grant execute on function public.cassio_seed_save(text) to authenticated, service_role;

revoke all on function public.cassio_seed_clear() from public, anon;
grant execute on function public.cassio_seed_clear() to authenticated, service_role;

revoke all on function public.cassio_action_remember(text, text, jsonb, text) from public;
grant execute on function public.cassio_action_remember(text, text, jsonb, text) to anon, authenticated, service_role;

revoke all on function public.cassio_visible_client(text, text) from public;
grant execute on function public.cassio_visible_client(text, text) to anon, authenticated, service_role;

revoke all on function public.cassio_visible_job(text, text) from public;
grant execute on function public.cassio_visible_job(text, text) to anon, authenticated, service_role;

revoke all on function public.cassio_lead_status(text, text) from public;
grant execute on function public.cassio_lead_status(text, text) to anon, authenticated, service_role;

revoke all on function public.cassio_action_commit(text, text) from public;
grant execute on function public.cassio_action_commit(text, text) to anon, authenticated, service_role;

revoke all on function public.cassio_seed_target(uuid) from public, anon, authenticated;
grant execute on function public.cassio_seed_target(uuid) to service_role;

revoke all on function public.cassio_seed_outbox_claim() from public, anon, authenticated;
grant execute on function public.cassio_seed_outbox_claim() to service_role;

revoke all on function public.cassio_seed_outbox_mark(uuid, boolean) from public, anon, authenticated;
grant execute on function public.cassio_seed_outbox_mark(uuid, boolean) to service_role;

revoke all on function public.enqueue_cassio_seed_status() from public, anon, authenticated;

notify pgrst, 'reload schema';
