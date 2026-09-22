-- Per-PM ElevenLabs voice agents. Missed-call intake writes leads, call
-- activity, and staff tasks. Tool calls authenticate with webhook_token.

create table if not exists public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  elevenlabs_agent_id text not null default '',
  inbound_number text not null default '',
  webhook_token text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_agents_staff_key
  on public.voice_agents (staff_id);
create unique index if not exists voice_agents_token_key
  on public.voice_agents (webhook_token);
create unique index if not exists voice_agents_elevenlabs_key
  on public.voice_agents (company_id, elevenlabs_agent_id)
  where elevenlabs_agent_id <> '';
create index if not exists voice_agents_company_idx
  on public.voice_agents (company_id);

alter table public.voice_agents enable row level security;

drop policy if exists "company isolation" on public.voice_agents;
create policy "company isolation" on public.voice_agents
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create or replace function public.voice_phone_key(value text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(value, ''), '\D', '', 'g'), 10);
$$;

create or replace function public.voice_next_job_code(p_company uuid, p_owner_name text)
returns text
language plpgsql
as $$
declare
  initials text;
  stamp text;
  prefix text;
  suffix text;
  n integer := 0;
  candidate text;
begin
  initials := upper(regexp_replace(coalesce(nullif(trim(p_owner_name), ''), 'XX'), '[^A-Za-z ]', '', 'g'));
  initials := left(regexp_replace(initials, '\s+', ' ', 'g'), 1)
    || coalesce(nullif(left(split_part(regexp_replace(initials, '\s+', ' ', 'g'), ' ', 2), 1), ''), 'X');
  stamp := to_char(timezone('America/Chicago', now()), 'MMDDYY');
  prefix := initials || stamp || '-';
  loop
    suffix := chr(65 + n);
    candidate := prefix || suffix;
    exit when not exists (
      select 1 from public.jobs where company_id = p_company and code = candidate
    ) and not exists (
      select 1 from public.opportunities where company_id = p_company and code = candidate
    );
    n := n + 1;
    if n > 25 then
      candidate := prefix || n::text;
      exit;
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.voice_agent_intake(
  p_token text,
  p_phone text,
  p_first_name text default '',
  p_last_name text default '',
  p_email text default '',
  p_street text default '',
  p_city text default '',
  p_state text default 'TX',
  p_postal_code text default '',
  p_notes text default '',
  p_transcript text default '',
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agent public.voice_agents%rowtype;
  called public.team_members%rowtype;
  owner_row public.team_members%rowtype;
  phone_key text;
  contact_row public.contacts%rowtype;
  job_row public.jobs%rowtype;
  opp_row public.opportunities%rowtype;
  past_job public.jobs%rowtype;
  past_owner public.team_members%rowtype;
  action text;
  match_kind text;
  owner_id uuid;
  originator_id uuid;
  full_name text;
  site text;
  lead_name text;
  job_code text;
  activity_body text;
  notify_sms text;
  author_name text;
  duration_note text := '';
  notes_note text := '';
  transcript_note text := '';
begin
  if coalesce(nullif(trim(p_token), ''), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing agent token.');
  end if;

  select * into agent
  from public.voice_agents
  where webhook_token = trim(p_token)
  limit 1;
  if not found or not agent.enabled then
    return jsonb_build_object('ok', false, 'error', 'Unknown or disabled voice agent.');
  end if;

  select * into called
  from public.team_members
  where id = agent.staff_id
  limit 1;
  if not found or called.locked then
    return jsonb_build_object('ok', false, 'error', 'That project manager seat is locked.');
  end if;

  phone_key := public.voice_phone_key(p_phone);
  if length(phone_key) < 7 then
    return jsonb_build_object('ok', false, 'error', 'Need a phone number to match or open a lead.');
  end if;

  select c.* into contact_row
  from public.contacts c
  where c.company_id = agent.company_id
    and length(public.voice_phone_key(c.phone)) >= 7
    and (
      public.voice_phone_key(c.phone) = phone_key
      or (
        length(phone_key) >= 10
        and public.voice_phone_key(c.phone) = phone_key
      )
    )
  order by case when public.voice_phone_key(c.phone) = phone_key then 0 else 1 end
  limit 1;

  if contact_row.id is not null then
    select j.* into job_row
    from public.jobs j
    left join public.opportunities o on o.id = j.opportunity_id
    where j.company_id = agent.company_id
      and j.deleted_at is null
      and j.status <> 'complete'
      and (
        j.primary_contact_id = contact_row.id
        or contact_row.id = any (coalesce(j.related_contact_ids, '{}'))
        or o.primary_contact_id = contact_row.id
      )
    order by j.created_at desc
    limit 1;

    if job_row.id is null then
      select o.* into opp_row
      from public.opportunities o
      where o.company_id = agent.company_id
        and o.stage <> 'lost'
        and o.primary_contact_id = contact_row.id
      order by o.created_at desc
      limit 1;
    end if;
  end if;

  originator_id := called.id;

  if job_row.id is not null then
    action := 'attach';
    match_kind := 'open_job';
    owner_id := coalesce(job_row.owner_staff_id, called.id);
    opp_row := null;
    select * into opp_row from public.opportunities where id = job_row.opportunity_id;
  elsif opp_row.id is not null then
    action := 'attach';
    match_kind := 'open_job';
    owner_id := coalesce(opp_row.owner_staff_id, called.id);
  else
    action := 'create';
    match_kind := 'unknown';
    owner_id := called.id;
    if contact_row.id is not null then
      select j.* into past_job
      from public.jobs j
      left join public.opportunities o on o.id = j.opportunity_id
      where j.company_id = agent.company_id
        and (
          j.primary_contact_id = contact_row.id
          or contact_row.id = any (coalesce(j.related_contact_ids, '{}'))
          or o.primary_contact_id = contact_row.id
        )
      order by coalesce(j.substantial_completion, j.start_date, j.created_at::text) desc
      limit 1;
      if past_job.owner_staff_id is not null then
        select * into past_owner
        from public.team_members
        where id = past_job.owner_staff_id
        limit 1;
      elsif contact_row.owner_staff_id is not null then
        select * into past_owner
        from public.team_members
        where id = contact_row.owner_staff_id
        limit 1;
      end if;
      if past_owner.id is not null and not past_owner.locked then
        owner_id := past_owner.id;
        match_kind := 'past_client';
      end if;
    end if;
  end if;

  select * into owner_row from public.team_members where id = owner_id;
  if owner_row.id is null then
    owner_row := called;
    owner_id := called.id;
  end if;

  full_name := trim(both ' ' from coalesce(nullif(trim(p_first_name), ''), '') || ' ' || coalesce(nullif(trim(p_last_name), ''), ''));
  if full_name = '' then
    full_name := coalesce(nullif(trim(contact_row.name), ''), 'Homeowner');
  end if;
  site := trim(both ' ' from concat_ws(', ',
    nullif(trim(p_street), ''),
    nullif(trim(concat_ws(' ', nullif(trim(p_city), ''), nullif(trim(coalesce(p_state, 'TX')), ''))), ''),
    nullif(trim(p_postal_code), '')
  ));
  lead_name := case
    when site <> '' then coalesce(nullif(trim(p_last_name), ''), full_name) || ' — ' || site
    else full_name
  end;

  if action = 'create' then
    if contact_row.id is null then
      insert into public.contacts (
        company_id, client_id, name, title, email, phone, owner_staff_id, is_referral_partner
      ) values (
        agent.company_id, null, full_name, 'Homeowner', coalesce(p_email, ''), coalesce(p_phone, ''),
        owner_id, false
      )
      returning * into contact_row;
    else
      update public.contacts
      set
        phone = case when coalesce(nullif(trim(p_phone), ''), '') <> '' then p_phone else phone end,
        email = case when coalesce(nullif(trim(p_email), ''), '') <> '' then p_email else email end,
        owner_staff_id = owner_id
      where id = contact_row.id
      returning * into contact_row;
    end if;

    job_code := public.voice_next_job_code(agent.company_id, owner_row.name);

    insert into public.opportunities (
      company_id, name, client_id, primary_contact_id, stage, value, location,
      project_type, market, delivery_method, estimator, owner_staff_id, originator_staff_id,
      win_probability, next_step, code, lead_source, street, city, state, postal_code, notes
    ) values (
      agent.company_id,
      lead_name,
      null,
      contact_row.id,
      'pursuing',
      0,
      coalesce(nullif(site, ''), 'Address TBD'),
      'roofing',
      'residential',
      'fixed_price',
      owner_row.name,
      owner_id,
      originator_id,
      20,
      'Call back within 5 minutes.',
      job_code,
      'phone',
      coalesce(p_street, ''),
      coalesce(p_city, ''),
      coalesce(nullif(trim(p_state), ''), 'TX'),
      coalesce(p_postal_code, ''),
      coalesce(p_notes, '')
    )
    returning * into opp_row;

    insert into public.jobs (
      company_id, opportunity_id, name, primary_contact_id, status, contract_value,
      start_date, project_manager, location, owner_staff_id, code, description,
      street, city, state, postal_code, project_type, market, lead_source
    ) values (
      agent.company_id,
      opp_row.id,
      lead_name,
      contact_row.id,
      'precon',
      0,
      current_date,
      owner_row.name,
      coalesce(nullif(site, ''), 'Address TBD'),
      owner_id,
      job_code,
      coalesce(p_notes, ''),
      coalesce(p_street, ''),
      coalesce(p_city, ''),
      coalesce(nullif(trim(p_state), ''), 'TX'),
      coalesce(p_postal_code, ''),
      'roofing',
      'residential',
      'phone'
    )
    returning * into job_row;
  else
    job_code := coalesce(job_row.code, opp_row.code, '');
    if contact_row.id is not null and coalesce(nullif(trim(p_phone), ''), '') <> '' then
      update public.contacts
      set phone = case when coalesce(nullif(trim(phone), ''), '') = '' then p_phone else phone end
      where id = contact_row.id;
    end if;
  end if;

  author_name := 'Voice · ' || called.name;
  if p_duration_seconds is not null and p_duration_seconds > 0 then
    duration_note := ' Duration ' || p_duration_seconds::text || 's.';
  end if;
  if coalesce(nullif(trim(p_notes), ''), '') <> '' then
    notes_note := ' ' || trim(p_notes);
  end if;
  if coalesce(nullif(trim(p_transcript), ''), '') <> '' then
    transcript_note := ' Transcript: ' || trim(p_transcript);
  end if;

  if action = 'attach' then
    activity_body := 'Missed call on ' || called.name || '''s line. Logged on this job; '
      || owner_row.name || ' was notified. No new card.'
      || duration_note || notes_note || transcript_note;
    notify_sms := coalesce(nullif(full_name, ''), 'A homeowner')
      || ' called ' || called.name || '''s line about '
      || coalesce(nullif(job_code, ''), 'your job')
      || '.' || notes_note || ' Logged on the job — no new card.';
  else
    activity_body := 'Missed call on ' || called.name || '''s line. Opened this lead for '
      || owner_row.name || '.'
      || duration_note || notes_note || transcript_note;
    if match_kind = 'past_client' then
      notify_sms := coalesce(nullif(full_name, ''), 'A homeowner')
        || ' called ' || called.name || '''s line. New lead '
        || job_code || ' is on your book.' || notes_note;
    else
      notify_sms := coalesce(nullif(full_name, ''), 'A homeowner')
        || ' called your line. New lead ' || job_code || ' is on your book.' || notes_note;
    end if;
  end if;

  if job_row.id is not null then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (agent.company_id, 'job', job_row.id, 'call', activity_body, author_name);
  elsif opp_row.id is not null then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (agent.company_id, 'opportunity', opp_row.id, 'call', activity_body, author_name);
  end if;

  insert into public.tasks (company_id, title, due_at, related_type, related_id, assignee, notes)
  values (
    agent.company_id,
    case
      when action = 'attach' then 'Missed call on ' || coalesce(nullif(job_code, ''), 'your job')
      else 'Call ' || full_name || ' back'
    end,
    current_date,
    case when job_row.id is not null then 'job' else 'opportunity' end,
    coalesce(job_row.id, opp_row.id),
    owner_row.name,
    notify_sms
  );

  return jsonb_build_object(
    'ok', true,
    'action', action,
    'matchKind', match_kind,
    'jobId', job_row.id,
    'opportunityId', opp_row.id,
    'contactId', contact_row.id,
    'jobCode', job_code,
    'ownerStaffId', owner_id,
    'ownerName', owner_row.name,
    'originatorStaffId', originator_id,
    'originatorName', called.name,
    'notifyStaffId', owner_id,
    'notifyName', owner_row.name,
    'notifyPhone', owner_row.phone,
    'notifySms', notify_sms,
    'author', author_name,
    'said', case
      when action = 'attach' then
        'I logged this on ' || owner_row.name || '''s job ' || coalesce(job_code, '') || '. They will follow up.'
      else
        'I opened a lead for ' || owner_row.name || ' — ' || coalesce(job_code, '') || '. They will call you back.'
    end
  );
end;
$$;

create or replace function public.voice_agent_lookup(p_token text, p_phone text, p_email text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agent public.voice_agents%rowtype;
  called public.team_members%rowtype;
  contact_row public.contacts%rowtype;
  job_row public.jobs%rowtype;
  owner_row public.team_members%rowtype;
  phone_key text;
begin
  select * into agent from public.voice_agents where webhook_token = trim(p_token) and enabled limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown or disabled voice agent.');
  end if;
  select * into called from public.team_members where id = agent.staff_id;
  phone_key := public.voice_phone_key(p_phone);
  if length(phone_key) < 7 and coalesce(nullif(trim(p_email), ''), '') = '' then
    return jsonb_build_object('ok', true, 'found', false, 'kind', 'unknown', 'said', 'I do not have that number on file yet.');
  end if;

  select c.* into contact_row
  from public.contacts c
  where c.company_id = agent.company_id
    and (
      (length(phone_key) >= 7 and public.voice_phone_key(c.phone) = phone_key)
      or (coalesce(nullif(lower(trim(p_email)), ''), '') <> '' and lower(trim(c.email)) = lower(trim(p_email)))
    )
  limit 1;

  if contact_row.id is null then
    return jsonb_build_object(
      'ok', true,
      'found', false,
      'kind', 'unknown',
      'calledStaffName', called.name,
      'said', 'I do not have that number on file yet. I can open a new lead.'
    );
  end if;

  select j.* into job_row
  from public.jobs j
  left join public.opportunities o on o.id = j.opportunity_id
  where j.company_id = agent.company_id
    and j.deleted_at is null
    and (
      j.primary_contact_id = contact_row.id
      or contact_row.id = any (coalesce(j.related_contact_ids, '{}'))
      or o.primary_contact_id = contact_row.id
    )
  order by case when j.status <> 'complete' then 0 else 1 end, j.created_at desc
  limit 1;

  if job_row.owner_staff_id is not null then
    select * into owner_row from public.team_members where id = job_row.owner_staff_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'kind', case when job_row.id is not null and job_row.status <> 'complete' then 'open_job' else 'past_client' end,
    'contactId', contact_row.id,
    'contactName', contact_row.name,
    'jobId', job_row.id,
    'jobCode', job_row.code,
    'opportunityId', job_row.opportunity_id,
    'ownerName', coalesce(owner_row.name, called.name),
    'calledStaffName', called.name,
    'said', case
      when job_row.id is not null and job_row.status <> 'complete' then
        'I see an open job ' || coalesce(job_row.code, '') || ' with ' || coalesce(owner_row.name, called.name) || '.'
      else
        'I see ' || contact_row.name || ' on file with ' || coalesce(owner_row.name, called.name) || '.'
    end
  );
end;
$$;

create or replace function public.voice_agent_book(
  p_token text,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_job_id uuid default null,
  p_opportunity_id uuid default null,
  p_kind text default 'site_walk',
  p_notes text default '',
  p_location text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agent public.voice_agents%rowtype;
  called public.team_members%rowtype;
  job_row public.jobs%rowtype;
  event_id uuid;
  ends timestamptz;
  kind_value text;
  activity_body text;
begin
  select * into agent from public.voice_agents where webhook_token = trim(p_token) and enabled limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown or disabled voice agent.');
  end if;
  select * into called from public.team_members where id = agent.staff_id;
  if called.locked then
    return jsonb_build_object('ok', false, 'error', 'That project manager seat is locked.');
  end if;
  if coalesce(nullif(trim(p_title), ''), '') = '' or p_starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'Title and start time are required.');
  end if;
  ends := coalesce(p_ends_at, p_starts_at + interval '1 hour');
  kind_value := case
    when p_kind in ('site_walk', 'pre_bid', 'inspection', 'production', 'meeting', 'punch') then p_kind
    else 'site_walk'
  end;
  if p_job_id is not null then
    select * into job_row from public.jobs where id = p_job_id and company_id = agent.company_id;
  end if;

  insert into public.schedule_events (
    company_id, title, kind, starts_at, ends_at, location, assignee,
    opportunity_id, job_id, client_id, notes
  ) values (
    agent.company_id,
    trim(p_title),
    kind_value::public.event_kind,
    p_starts_at,
    ends,
    coalesce(nullif(trim(p_location), ''), coalesce(job_row.location, '')),
    called.name,
    coalesce(p_opportunity_id, job_row.opportunity_id),
    coalesce(p_job_id, job_row.id),
    job_row.client_id,
    coalesce(p_notes, '')
  )
  returning id into event_id;

  activity_body := 'Booked ' || trim(p_title) || ' for ' || called.name || ' at ' || p_starts_at::text || '.';
  if job_row.id is not null then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (agent.company_id, 'job', job_row.id, 'meeting', activity_body, 'Voice · ' || called.name);
  elsif p_opportunity_id is not null then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (agent.company_id, 'opportunity', p_opportunity_id, 'meeting', activity_body, 'Voice · ' || called.name);
  end if;

  return jsonb_build_object(
    'ok', true,
    'eventId', event_id,
    'title', trim(p_title),
    'startsAt', p_starts_at,
    'endsAt', ends,
    'assignee', called.name,
    'jobId', coalesce(p_job_id, job_row.id),
    'said', 'Booked ' || trim(p_title) || ' with ' || called.name || '.'
  );
end;
$$;

create or replace function public.voice_agent_log(
  p_token text,
  p_body text,
  p_job_id uuid default null,
  p_opportunity_id uuid default null,
  p_type text default 'call'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agent public.voice_agents%rowtype;
  called public.team_members%rowtype;
  type_value text;
  entity_type text;
  entity_id uuid;
begin
  select * into agent from public.voice_agents where webhook_token = trim(p_token) and enabled limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown or disabled voice agent.');
  end if;
  select * into called from public.team_members where id = agent.staff_id;
  if coalesce(nullif(trim(p_body), ''), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Nothing to log.');
  end if;
  type_value := case when p_type in ('note', 'call', 'email', 'meeting', 'site_walk', 'text') then p_type else 'call' end;
  if p_job_id is not null then
    entity_type := 'job';
    entity_id := p_job_id;
  elsif p_opportunity_id is not null then
    entity_type := 'opportunity';
    entity_id := p_opportunity_id;
  else
    return jsonb_build_object('ok', false, 'error', 'Need a job or opportunity to log on.');
  end if;

  insert into public.activities (company_id, entity_type, entity_id, type, body, author)
  values (
    agent.company_id,
    entity_type::public.entity_kind,
    entity_id,
    type_value::public.activity_type,
    trim(p_body),
    'Voice · ' || called.name
  );

  return jsonb_build_object('ok', true, 'entityType', entity_type, 'entityId', entity_id);
end;
$$;

revoke all on function public.voice_phone_key(text) from public;
revoke all on function public.voice_next_job_code(uuid, text) from public;
revoke all on function public.voice_agent_intake(text, text, text, text, text, text, text, text, text, text, text, integer) from public;
revoke all on function public.voice_agent_lookup(text, text, text) from public;
revoke all on function public.voice_agent_book(text, text, timestamptz, timestamptz, uuid, uuid, text, text, text) from public;
revoke all on function public.voice_agent_log(text, text, uuid, uuid, text) from public;

grant execute on function public.voice_agent_intake(text, text, text, text, text, text, text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.voice_agent_lookup(text, text, text) to anon, authenticated;
grant execute on function public.voice_agent_book(text, text, timestamptz, timestamptz, uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.voice_agent_log(text, text, uuid, uuid, text) to anon, authenticated;
