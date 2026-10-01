-- Photon Spectrum Voice + LiveKit Cloud dialer.
-- Company-scoped endpoints, queues, routes, sessions, and legs.

create table if not exists public.calling_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  enabled boolean not null default false,
  office_line text not null default '',
  livekit_outbound_trunk_id text not null default '',
  livekit_inbound_trunk_id text not null default '',
  livekit_dispatch_rule_id text not null default '',
  webhook_token text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists calling_settings_webhook_token_key
  on public.calling_settings (webhook_token)
  where webhook_token <> '';

create table if not exists public.call_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  kind text not null check (kind in ('softphone', 'cell', 'app')),
  phone text not null default '',
  enabled boolean not null default true,
  priority integer not null default 100,
  ring_timeout_seconds integer not null default 25
    check (ring_timeout_seconds >= 5 and ring_timeout_seconds <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, kind)
);

create index if not exists call_endpoints_company_idx
  on public.call_endpoints (company_id);
create index if not exists call_endpoints_staff_idx
  on public.call_endpoints (staff_id);

create table if not exists public.call_queues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  strategy text not null default 'simultaneous'
    check (strategy in ('simultaneous')),
  fallback text not null default 'missed_log'
    check (fallback in ('none', 'missed_log', 'voice_agent')),
  fallback_voice_agent_staff_id uuid references public.team_members (id) on delete set null,
  ring_timeout_seconds integer not null default 25
    check (ring_timeout_seconds >= 5 and ring_timeout_seconds <= 120),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_queues_company_idx
  on public.call_queues (company_id);

create table if not exists public.call_queue_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  queue_id uuid not null references public.call_queues (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  use_softphone boolean not null default true,
  use_cell boolean not null default true,
  use_app boolean not null default true,
  created_at timestamptz not null default now(),
  unique (queue_id, staff_id)
);

create index if not exists call_queue_members_company_idx
  on public.call_queue_members (company_id);
create index if not exists call_queue_members_queue_idx
  on public.call_queue_members (queue_id);

create table if not exists public.call_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  match_number text not null default '',
  target_type text not null check (target_type in ('queue', 'staff')),
  target_queue_id uuid references public.call_queues (id) on delete cascade,
  target_staff_id uuid references public.team_members (id) on delete cascade,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_type = 'queue' and target_queue_id is not null and target_staff_id is null)
    or (target_type = 'staff' and target_staff_id is not null and target_queue_id is null)
  )
);

create index if not exists call_routes_company_idx
  on public.call_routes (company_id);

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  room_name text not null,
  from_number text not null default '',
  to_number text not null default '',
  status text not null default 'ringing'
    check (status in ('ringing', 'active', 'ended', 'missed', 'failed', 'transferred')),
  queue_id uuid references public.call_queues (id) on delete set null,
  answered_staff_id uuid references public.team_members (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  caller_participant_identity text not null default '',
  livekit_sip_call_id text not null default '',
  disposition text not null default '',
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_sessions_room_name_key
  on public.call_sessions (room_name);
create index if not exists call_sessions_company_started_idx
  on public.call_sessions (company_id, started_at desc);
create index if not exists call_sessions_status_idx
  on public.call_sessions (company_id, status);

create table if not exists public.call_legs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  session_id uuid not null references public.call_sessions (id) on delete cascade,
  staff_id uuid references public.team_members (id) on delete set null,
  kind text not null check (kind in ('softphone', 'cell', 'app', 'pstn', 'transfer')),
  phone text not null default '',
  participant_identity text not null default '',
  status text not null default 'ringing'
    check (status in ('ringing', 'answered', 'cancelled', 'missed', 'failed', 'ended')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_legs_session_idx on public.call_legs (session_id);
create index if not exists call_legs_staff_status_idx
  on public.call_legs (staff_id, status)
  where staff_id is not null;
create index if not exists call_legs_company_idx on public.call_legs (company_id);

alter table public.calling_settings enable row level security;
alter table public.call_endpoints enable row level security;
alter table public.call_queues enable row level security;
alter table public.call_queue_members enable row level security;
alter table public.call_routes enable row level security;
alter table public.call_sessions enable row level security;
alter table public.call_legs enable row level security;

drop policy if exists "company isolation" on public.calling_settings;
create policy "company isolation" on public.calling_settings
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.call_endpoints;
create policy "company isolation" on public.call_endpoints
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.call_queues;
create policy "company isolation" on public.call_queues
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.call_queue_members;
create policy "company isolation" on public.call_queue_members
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.call_routes;
create policy "company isolation" on public.call_routes
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.call_sessions;
create policy "company isolation" on public.call_sessions
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.call_legs;
create policy "company isolation" on public.call_legs
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create or replace function public.calling_phone_key(value text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(value, ''), '\D', '', 'g'), 10);
$$;

create or replace function public.calling_admin_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_role text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select profile.company_id, profile.role::text
    into v_company, v_role
  from public.profiles profile
  where profile.id = auth.uid()
  limit 1;
  if v_company is null then
    return null;
  end if;
  if v_role is distinct from 'company_admin' then
    return null;
  end if;
  return v_company;
end;
$$;

create or replace function public.calling_mint_webhook_token()
returns text
language plpgsql
as $$
begin
  return encode(gen_random_bytes(24), 'hex');
end;
$$;

create or replace function public.calling_company_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_name text;
  settings public.calling_settings%rowtype;
begin
  v_company := public.calling_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can view calling settings.');
  end if;
  select companies.name into v_name from public.companies where id = v_company;
  select * into settings from public.calling_settings where company_id = v_company;
  if not found then
    return jsonb_build_object(
      'ok', true,
      'enabled', false,
      'companyName', coalesce(v_name, ''),
      'officeLine', '',
      'livekitOutboundTrunkId', '',
      'livekitInboundTrunkId', '',
      'livekitDispatchRuleId', '',
      'webhookToken', '',
      'configured', false
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'enabled', settings.enabled,
    'companyName', coalesce(v_name, ''),
    'officeLine', coalesce(settings.office_line, ''),
    'livekitOutboundTrunkId', coalesce(settings.livekit_outbound_trunk_id, ''),
    'livekitInboundTrunkId', coalesce(settings.livekit_inbound_trunk_id, ''),
    'livekitDispatchRuleId', coalesce(settings.livekit_dispatch_rule_id, ''),
    'webhookToken', coalesce(settings.webhook_token, ''),
    'configured', settings.enabled
      and settings.office_line <> ''
      and settings.livekit_outbound_trunk_id <> ''
  );
end;
$$;

create or replace function public.calling_company_save(
  p_enabled boolean,
  p_office_line text,
  p_livekit_outbound_trunk_id text default '',
  p_livekit_inbound_trunk_id text default '',
  p_livekit_dispatch_rule_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  settings public.calling_settings%rowtype;
  v_token text;
begin
  v_company := public.calling_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can change calling settings.');
  end if;

  select * into settings from public.calling_settings where company_id = v_company;
  if found and settings.webhook_token <> '' then
    v_token := settings.webhook_token;
  else
    v_token := public.calling_mint_webhook_token();
  end if;

  insert into public.calling_settings (
    company_id,
    enabled,
    office_line,
    livekit_outbound_trunk_id,
    livekit_inbound_trunk_id,
    livekit_dispatch_rule_id,
    webhook_token,
    updated_at
  ) values (
    v_company,
    coalesce(p_enabled, false),
    coalesce(trim(p_office_line), ''),
    coalesce(trim(p_livekit_outbound_trunk_id), ''),
    coalesce(trim(p_livekit_inbound_trunk_id), ''),
    coalesce(trim(p_livekit_dispatch_rule_id), ''),
    v_token,
    now()
  )
  on conflict (company_id) do update
  set
    enabled = excluded.enabled,
    office_line = excluded.office_line,
    livekit_outbound_trunk_id = excluded.livekit_outbound_trunk_id,
    livekit_inbound_trunk_id = excluded.livekit_inbound_trunk_id,
    livekit_dispatch_rule_id = excluded.livekit_dispatch_rule_id,
    webhook_token = case
      when calling_settings.webhook_token <> '' then calling_settings.webhook_token
      else excluded.webhook_token
    end,
    updated_at = now();

  return public.calling_company_status();
end;
$$;

create or replace function public.calling_inbound_company(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.calling_settings%rowtype;
begin
  if trim(coalesce(p_token, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing webhook token.');
  end if;
  select * into settings
  from public.calling_settings
  where webhook_token = trim(p_token)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown webhook.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'companyId', settings.company_id,
    'enabled', settings.enabled,
    'officeLine', settings.office_line,
    'livekitOutboundTrunkId', settings.livekit_outbound_trunk_id,
    'livekitInboundTrunkId', settings.livekit_inbound_trunk_id,
    'livekitDispatchRuleId', settings.livekit_dispatch_rule_id
  );
end;
$$;

create or replace function public.calling_settings_for_company(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.calling_settings%rowtype;
begin
  select * into settings from public.calling_settings where company_id = p_company;
  if not found then
    return jsonb_build_object('ok', true, 'configured', false, 'enabled', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'configured', settings.enabled
      and settings.office_line <> ''
      and settings.livekit_outbound_trunk_id <> '',
    'enabled', settings.enabled,
    'officeLine', settings.office_line,
    'livekitOutboundTrunkId', settings.livekit_outbound_trunk_id,
    'livekitInboundTrunkId', settings.livekit_inbound_trunk_id,
    'livekitDispatchRuleId', settings.livekit_dispatch_rule_id,
    'webhookToken', settings.webhook_token
  );
end;
$$;

create or replace function public.calling_match_contact(p_company uuid, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  phone_key text := public.calling_phone_key(p_phone);
  contact_row public.contacts%rowtype;
  job_id uuid;
  opp_id uuid;
begin
  if phone_key = '' or length(phone_key) < 7 then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  select * into contact_row
  from public.contacts
  where company_id = p_company
    and public.calling_phone_key(phone) = phone_key
  order by name asc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  select j.id into job_id
  from public.jobs j
  where j.company_id = p_company
    and (
      j.primary_contact_id = contact_row.id
      or contact_row.id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
    )
    and j.status::text is distinct from 'lost'
  order by j.created_at desc
  limit 1;

  if job_id is null then
    select o.id into opp_id
    from public.opportunities o
    where o.company_id = p_company
      and o.primary_contact_id = contact_row.id
      and o.stage::text is distinct from 'lost'
    order by o.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'matched', true,
    'contactId', contact_row.id,
    'contactName', contact_row.name,
    'jobId', job_id,
    'opportunityId', opp_id
  );
end;
$$;

create or replace function public.calling_resolve_route(p_company uuid, p_to_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  route public.call_routes%rowtype;
  phone_key text := public.calling_phone_key(p_to_number);
  settings public.calling_settings%rowtype;
begin
  select * into settings from public.calling_settings where company_id = p_company;
  if not found or not settings.enabled then
    return jsonb_build_object('ok', false, 'error', 'Calling is not enabled for this office.');
  end if;

  select * into route
  from public.call_routes
  where company_id = p_company
    and enabled
    and (
      public.calling_phone_key(match_number) = phone_key
      or trim(match_number) = ''
      or trim(match_number) = '*'
    )
  order by
    case
      when public.calling_phone_key(match_number) = phone_key and phone_key <> '' then 0
      else 1
    end,
    priority asc,
    created_at asc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'targetType', 'office',
      'officeLine', settings.office_line,
      'queueId', null,
      'staffId', null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'targetType', route.target_type,
    'queueId', route.target_queue_id,
    'staffId', route.target_staff_id,
    'routeId', route.id,
    'officeLine', settings.office_line
  );
end;
$$;

create or replace function public.calling_ring_targets(p_company uuid, p_queue_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  targets jsonb := '[]'::jsonb;
  member record;
  endpoint record;
  staff_phone text;
begin
  if p_queue_id is not null then
    for member in
      select m.*, tm.phone as staff_phone, tm.locked, tm.name as staff_name
      from public.call_queue_members m
      join public.team_members tm on tm.id = m.staff_id
      where m.company_id = p_company
        and m.queue_id = p_queue_id
        and tm.locked is distinct from true
    loop
      if member.use_softphone then
        select * into endpoint
        from public.call_endpoints
        where company_id = p_company
          and staff_id = member.staff_id
          and kind = 'softphone'
        limit 1;
        if not found or endpoint.enabled then
          targets := targets || jsonb_build_array(jsonb_build_object(
            'staffId', member.staff_id,
            'staffName', member.staff_name,
            'kind', 'softphone',
            'phone', '',
            'ringTimeoutSeconds', coalesce(endpoint.ring_timeout_seconds, 25)
          ));
        end if;
      end if;

      if member.use_app then
        select * into endpoint
        from public.call_endpoints
        where company_id = p_company
          and staff_id = member.staff_id
          and kind = 'app'
          and enabled
        limit 1;
        if found then
          targets := targets || jsonb_build_array(jsonb_build_object(
            'staffId', member.staff_id,
            'staffName', member.staff_name,
            'kind', 'app',
            'phone', '',
            'ringTimeoutSeconds', coalesce(endpoint.ring_timeout_seconds, 25)
          ));
        end if;
      end if;

      if member.use_cell then
        select * into endpoint
        from public.call_endpoints
        where company_id = p_company
          and staff_id = member.staff_id
          and kind = 'cell'
          and enabled
        limit 1;
        staff_phone := coalesce(nullif(trim(endpoint.phone), ''), nullif(trim(member.staff_phone), ''), '');
        if staff_phone <> '' then
          targets := targets || jsonb_build_array(jsonb_build_object(
            'staffId', member.staff_id,
            'staffName', member.staff_name,
            'kind', 'cell',
            'phone', staff_phone,
            'ringTimeoutSeconds', coalesce(endpoint.ring_timeout_seconds, 25)
          ));
        end if;
      end if;
    end loop;
  elsif p_staff_id is not null then
    select tm.phone into staff_phone
    from public.team_members tm
    where tm.id = p_staff_id
      and tm.company_id = p_company
      and tm.locked is distinct from true
    limit 1;

    if found then
      for endpoint in
        select *
        from public.call_endpoints
        where company_id = p_company
          and staff_id = p_staff_id
          and enabled
        order by priority asc, kind
      loop
        targets := targets || jsonb_build_array(jsonb_build_object(
          'staffId', p_staff_id,
          'kind', endpoint.kind,
          'phone', case
            when endpoint.kind = 'cell' then coalesce(nullif(trim(endpoint.phone), ''), nullif(trim(staff_phone), ''), '')
            else ''
          end,
          'ringTimeoutSeconds', endpoint.ring_timeout_seconds
        ));
      end loop;

      if targets = '[]'::jsonb then
        targets := jsonb_build_array(
          jsonb_build_object('staffId', p_staff_id, 'kind', 'softphone', 'phone', '', 'ringTimeoutSeconds', 25)
        );
        if coalesce(staff_phone, '') <> '' then
          targets := targets || jsonb_build_array(jsonb_build_object(
            'staffId', p_staff_id,
            'kind', 'cell',
            'phone', staff_phone,
            'ringTimeoutSeconds', 25
          ));
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'targets', targets);
end;
$$;

create or replace function public.calling_start_session(
  p_company uuid,
  p_direction text,
  p_room_name text,
  p_from_number text,
  p_to_number text,
  p_queue_id uuid default null,
  p_caller_participant_identity text default '',
  p_livekit_sip_call_id text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match jsonb;
  session_id uuid;
begin
  if p_company is null or trim(coalesce(p_room_name, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing company or room.');
  end if;

  match := public.calling_match_contact(p_company, case when p_direction = 'inbound' then p_from_number else p_to_number end);

  insert into public.call_sessions (
    company_id,
    direction,
    room_name,
    from_number,
    to_number,
    status,
    queue_id,
    contact_id,
    job_id,
    opportunity_id,
    caller_participant_identity,
    livekit_sip_call_id,
    metadata
  ) values (
    p_company,
    p_direction,
    trim(p_room_name),
    coalesce(trim(p_from_number), ''),
    coalesce(trim(p_to_number), ''),
    'ringing',
    p_queue_id,
    nullif(match->>'contactId', '')::uuid,
    nullif(match->>'jobId', '')::uuid,
    nullif(match->>'opportunityId', '')::uuid,
    coalesce(trim(p_caller_participant_identity), ''),
    coalesce(trim(p_livekit_sip_call_id), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into session_id;

  return jsonb_build_object(
    'ok', true,
    'sessionId', session_id,
    'contactId', match->>'contactId',
    'contactName', match->>'contactName',
    'jobId', match->>'jobId',
    'opportunityId', match->>'opportunityId'
  );
end;
$$;

create or replace function public.calling_add_leg(
  p_session_id uuid,
  p_staff_id uuid,
  p_kind text,
  p_phone text default '',
  p_participant_identity text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.call_sessions%rowtype;
  leg_id uuid;
begin
  select * into session from public.call_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown call session.');
  end if;

  insert into public.call_legs (
    company_id, session_id, staff_id, kind, phone, participant_identity, status
  ) values (
    session.company_id,
    p_session_id,
    p_staff_id,
    p_kind,
    coalesce(trim(p_phone), ''),
    coalesce(trim(p_participant_identity), ''),
    'ringing'
  )
  returning id into leg_id;

  return jsonb_build_object('ok', true, 'legId', leg_id);
end;
$$;

create or replace function public.calling_answer_leg(
  p_leg_id uuid,
  p_participant_identity text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  leg public.call_legs%rowtype;
  session public.call_sessions%rowtype;
  cancelled uuid[];
begin
  select * into leg from public.call_legs where id = p_leg_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown call leg.');
  end if;

  select * into session from public.call_sessions where id = leg.session_id for update;
  if session.status in ('ended', 'missed', 'failed', 'transferred') then
    return jsonb_build_object('ok', false, 'error', 'Call already ended.', 'sessionStatus', session.status);
  end if;
  if session.status = 'active' and session.answered_staff_id is distinct from leg.staff_id then
    update public.call_legs
    set status = 'cancelled', ended_at = now(), updated_at = now()
    where id = leg.id and status = 'ringing';
    return jsonb_build_object('ok', false, 'error', 'Another endpoint already answered.', 'winner', false);
  end if;

  update public.call_legs
  set
    status = 'answered',
    answered_at = coalesce(answered_at, now()),
    participant_identity = case
      when trim(coalesce(p_participant_identity, '')) <> '' then trim(p_participant_identity)
      else participant_identity
    end,
    updated_at = now()
  where id = leg.id;

  update public.call_sessions
  set
    status = 'active',
    answered_staff_id = leg.staff_id,
    answered_at = coalesce(answered_at, now()),
    updated_at = now()
  where id = session.id;

  with cancelled_rows as (
    update public.call_legs
    set status = 'cancelled', ended_at = now(), updated_at = now()
    where session_id = session.id
      and id <> leg.id
      and status = 'ringing'
    returning id
  )
  select coalesce(array_agg(id), '{}') into cancelled from cancelled_rows;

  return jsonb_build_object(
    'ok', true,
    'winner', true,
    'sessionId', session.id,
    'legId', leg.id,
    'staffId', leg.staff_id,
    'cancelledLegIds', to_jsonb(cancelled),
    'roomName', session.room_name,
    'callerParticipantIdentity', session.caller_participant_identity
  );
end;
$$;

create or replace function public.calling_end_session(
  p_session_id uuid,
  p_status text default 'ended',
  p_disposition text default '',
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.call_sessions%rowtype;
  final_status text := coalesce(nullif(trim(p_status), ''), 'ended');
begin
  select * into session from public.call_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown call session.');
  end if;

  if session.status = 'ringing' and final_status = 'ended' then
    final_status := 'missed';
  end if;

  update public.call_sessions
  set
    status = final_status,
    disposition = coalesce(trim(p_disposition), disposition),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds),
    ended_at = coalesce(ended_at, now()),
    updated_at = now()
  where id = session.id;

  update public.call_legs
  set
    status = case
      when status = 'answered' then 'ended'
      when status = 'ringing' then 'missed'
      else status
    end,
    ended_at = coalesce(ended_at, now()),
    updated_at = now()
  where session_id = session.id
    and status in ('ringing', 'answered');

  return jsonb_build_object('ok', true, 'sessionId', session.id, 'status', final_status);
end;
$$;

create or replace function public.calling_log_activity(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.call_sessions%rowtype;
  body text;
  author_name text := 'Phone';
  entity_type text;
  entity_id uuid;
begin
  select * into session from public.call_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown call session.');
  end if;

  if session.answered_staff_id is not null then
    select name into author_name from public.team_members where id = session.answered_staff_id;
  end if;

  body := case session.direction
    when 'inbound' then 'Inbound call'
    else 'Outbound call'
  end;
  body := body || ' ' || case session.status
    when 'missed' then 'missed'
    when 'failed' then 'failed'
    when 'transferred' then 'transferred'
    else 'completed'
  end;
  if session.from_number <> '' then
    body := body || ' from ' || session.from_number;
  end if;
  if session.to_number <> '' then
    body := body || ' to ' || session.to_number;
  end if;
  if session.duration_seconds is not null then
    body := body || ' (' || session.duration_seconds::text || 's)';
  end if;
  if session.disposition <> '' then
    body := body || '. ' || session.disposition;
  end if;

  if session.job_id is not null then
    entity_type := 'job';
    entity_id := session.job_id;
  elsif session.opportunity_id is not null then
    entity_type := 'opportunity';
    entity_id := session.opportunity_id;
  elsif session.contact_id is not null then
    entity_type := 'contact';
    entity_id := session.contact_id;
  else
    return jsonb_build_object('ok', true, 'logged', false);
  end if;

  insert into public.activities (company_id, entity_type, entity_id, type, body, author)
  values (
    session.company_id,
    entity_type,
    entity_id,
    'call',
    body,
    coalesce(nullif(trim(author_name), ''), 'Phone')
  );

  return jsonb_build_object('ok', true, 'logged', true, 'entityType', entity_type, 'entityId', entity_id);
end;
$$;

create or replace function public.calling_ensure_default_endpoints(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member public.team_members%rowtype;
begin
  select * into member from public.team_members where id = p_staff_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown seat.');
  end if;

  insert into public.call_endpoints (company_id, staff_id, kind, phone, enabled)
  values
    (member.company_id, member.id, 'softphone', '', true),
    (member.company_id, member.id, 'cell', coalesce(member.phone, ''), true),
    (member.company_id, member.id, 'app', '', false)
  on conflict (staff_id, kind) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.calling_get_session(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  session public.call_sessions%rowtype;
begin
  select * into session from public.call_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown call session.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', session.id,
    'companyId', session.company_id,
    'direction', session.direction,
    'roomName', session.room_name,
    'fromNumber', session.from_number,
    'toNumber', session.to_number,
    'status', session.status,
    'queueId', session.queue_id,
    'answeredStaffId', session.answered_staff_id,
    'contactId', session.contact_id,
    'jobId', session.job_id,
    'opportunityId', session.opportunity_id,
    'callerParticipantIdentity', session.caller_participant_identity,
    'disposition', session.disposition,
    'durationSeconds', session.duration_seconds,
    'startedAt', session.started_at,
    'answeredAt', session.answered_at,
    'endedAt', session.ended_at
  );
end;
$$;

create or replace function public.calling_get_leg(p_leg_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  leg public.call_legs%rowtype;
begin
  select * into leg from public.call_legs where id = p_leg_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown call leg.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', leg.id,
    'companyId', leg.company_id,
    'sessionId', leg.session_id,
    'staffId', leg.staff_id,
    'kind', leg.kind,
    'phone', leg.phone,
    'participantIdentity', leg.participant_identity,
    'status', leg.status
  );
end;
$$;

create or replace function public.calling_set_leg_identity(p_leg_id uuid, p_identity text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.call_legs
  set participant_identity = coalesce(trim(p_identity), ''), updated_at = now()
  where id = p_leg_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown call leg.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.calling_fail_leg(p_leg_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.call_legs
  set status = 'failed', ended_at = coalesce(ended_at, now()), updated_at = now()
  where id = p_leg_id and status = 'ringing';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.calling_queue_fallback(p_queue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  queue public.call_queues%rowtype;
begin
  if p_queue_id is null then
    return jsonb_build_object('ok', true, 'fallback', 'missed_log', 'voiceStaffId', null);
  end if;
  select * into queue from public.call_queues where id = p_queue_id;
  if not found then
    return jsonb_build_object('ok', true, 'fallback', 'missed_log', 'voiceStaffId', null);
  end if;
  return jsonb_build_object(
    'ok', true,
    'fallback', queue.fallback,
    'voiceStaffId', queue.fallback_voice_agent_staff_id
  );
end;
$$;

create or replace function public.calling_voice_agent_number(p_company uuid, p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  agent public.voice_agents%rowtype;
begin
  select * into agent
  from public.voice_agents
  where company_id = p_company
    and staff_id = p_staff_id
    and enabled
  limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'number', '');
  end if;
  return jsonb_build_object('ok', true, 'number', coalesce(agent.inbound_number, ''));
end;
$$;

create or replace function public.calling_find_session_by_room(p_room_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  session public.call_sessions%rowtype;
begin
  select * into session
  from public.call_sessions
  where room_name = trim(p_room_name)
  order by started_at desc
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown room.');
  end if;
  return public.calling_get_session(session.id);
end;
$$;

create or replace function public.calling_incoming_for_staff(p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  payload jsonb := '[]'::jsonb;
  row record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in.');
  end if;
  select company_id into v_company from public.profiles where id = auth.uid();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Missing company.');
  end if;

  for row in
    select
      leg.id as leg_id,
      leg.session_id,
      leg.kind,
      session.room_name,
      session.from_number,
      session.to_number,
      session.started_at,
      contact.name as contact_name
    from public.call_legs leg
    join public.call_sessions session on session.id = leg.session_id
    left join public.contacts contact on contact.id = session.contact_id
    where leg.company_id = v_company
      and leg.staff_id = p_staff_id
      and leg.status = 'ringing'
      and session.status = 'ringing'
      and leg.kind in ('softphone', 'app')
    order by leg.started_at desc
    limit 20
  loop
    payload := payload || jsonb_build_array(jsonb_build_object(
      'legId', row.leg_id,
      'sessionId', row.session_id,
      'kind', row.kind,
      'roomName', row.room_name,
      'fromNumber', row.from_number,
      'toNumber', row.to_number,
      'contactName', row.contact_name,
      'startedAt', row.started_at
    ));
  end loop;

  return jsonb_build_object('ok', true, 'incoming', payload);
end;
$$;

grant execute on function public.calling_company_status() to authenticated;
grant execute on function public.calling_company_save(boolean, text, text, text, text) to authenticated;
grant execute on function public.calling_inbound_company(text) to anon, authenticated, service_role;
grant execute on function public.calling_settings_for_company(uuid) to anon, authenticated, service_role;
grant execute on function public.calling_match_contact(uuid, text) to anon, authenticated, service_role;
grant execute on function public.calling_resolve_route(uuid, text) to anon, authenticated, service_role;
grant execute on function public.calling_ring_targets(uuid, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.calling_start_session(uuid, text, text, text, text, uuid, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.calling_add_leg(uuid, uuid, text, text, text) to anon, authenticated, service_role;
grant execute on function public.calling_answer_leg(uuid, text) to anon, authenticated, service_role;
grant execute on function public.calling_end_session(uuid, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.calling_log_activity(uuid) to anon, authenticated, service_role;
grant execute on function public.calling_ensure_default_endpoints(uuid) to authenticated;
grant execute on function public.calling_get_session(uuid) to anon, authenticated, service_role;
grant execute on function public.calling_get_leg(uuid) to anon, authenticated, service_role;
grant execute on function public.calling_set_leg_identity(uuid, text) to anon, authenticated, service_role;
grant execute on function public.calling_fail_leg(uuid) to anon, authenticated, service_role;
grant execute on function public.calling_queue_fallback(uuid) to anon, authenticated, service_role;
grant execute on function public.calling_voice_agent_number(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.calling_find_session_by_room(text) to anon, authenticated, service_role;
grant execute on function public.calling_incoming_for_staff(uuid) to authenticated;
