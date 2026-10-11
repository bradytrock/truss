-- Use unqualified once the enum value from 20261010170000 is committed.
-- Unqualified parks a job the same way Lost does, and open-pursuit matching skips it.
-- Close rate stays won versus lost; this stage is not a loss.

create or replace function public.automation_apply_job(
  p_job_id uuid,
  p_set_value boolean,
  p_value numeric,
  p_stage text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_opp uuid;
  v_status public.job_status;
  v_stage public.pipeline_stage;
  v_set_stage boolean := false;
begin
  select company_id, opportunity_id into v_company, v_opp
  from public.jobs
  where id = p_job_id;
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'That job is gone.');
  end if;

  if p_set_value then
    update public.jobs
    set contract_value = coalesce(p_value, 0)
    where id = p_job_id;
    if v_opp is not null then
      update public.opportunities
      set value = coalesce(p_value, 0)
      where id = v_opp;
    end if;
  end if;

  if coalesce(p_stage, '') <> '' then
    if p_stage = 'lead' then
      v_status := 'precon'; v_stage := 'pursuing'; v_set_stage := true;
    elsif p_stage = 'proposal_sent' then
      v_status := 'precon'; v_stage := 'bid_submitted'; v_set_stage := true;
    elsif p_stage = 'supplementing' or p_stage = 'estimating' then
      v_status := 'precon'; v_stage := 'supplementing'; v_set_stage := true;
    elsif p_stage = 'in_progress' then
      v_status := 'in_progress'; v_stage := 'awarded'; v_set_stage := true;
    elsif p_stage = 'punch' then
      v_status := 'punch'; v_stage := 'awarded'; v_set_stage := true;
    elsif p_stage = 'complete' then
      v_status := 'complete'; v_stage := 'awarded'; v_set_stage := true;
    elsif p_stage = 'on_hold' then
      v_status := 'on_hold'; v_set_stage := false;
    elsif p_stage = 'lost' then
      v_status := 'on_hold'; v_stage := 'lost'; v_set_stage := true;
    elsif p_stage = 'unqualified' then
      v_status := 'on_hold'; v_stage := 'unqualified'; v_set_stage := true;
    else
      return jsonb_build_object('ok', false, 'error', 'Pick a stage.');
    end if;
    update public.jobs set status = v_status where id = p_job_id;
    if v_set_stage and v_opp is not null then
      update public.opportunities set stage = v_stage where id = v_opp;
    end if;
  end if;

  if coalesce(trim(p_note), '') <> '' then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (v_company, 'job', p_job_id, 'note', trim(p_note), 'Automation');
  end if;

  return jsonb_build_object('ok', true);
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
        and o.stage not in ('lost', 'unqualified')
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

create or replace function public.ingest_inbound_text(
  p_from text,
  p_body text,
  p_handle text default '',
  p_media_url text default '',
  p_sent_at text default null,
  p_company_id uuid default null,
  p_kind text default '',
  p_detail text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_contact public.contacts%rowtype;
  v_job public.jobs%rowtype;
  v_opp_id uuid;
  v_message public.messages%rowtype;
  v_author text;
  v_body text;
  v_created timestamptz;
  v_activity_type public.activity_type := 'call';
begin
  if p_company_id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'missing_company');
  end if;

  v_digits := public.phone_last10(p_from);
  if length(v_digits) < 10 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'bad_phone');
  end if;

  v_body := trim(coalesce(p_body, ''));
  if v_body = '' and trim(coalesce(p_media_url, '')) <> '' then
    v_body := '(photo or attachment)';
  end if;
  if v_body = '' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'empty');
  end if;

  v_created := now();
  begin
    if coalesce(trim(p_sent_at), '') <> '' then
      v_created := p_sent_at::timestamptz;
    end if;
  exception
    when others then
      v_created := now();
  end;

  select c.*
  into v_contact
  from public.contacts c
  where c.company_id = p_company_id
    and public.phone_last10(c.phone) = v_digits
  order by (
    select max(j.start_date)
    from public.jobs j
    where j.company_id = c.company_id
      and j.deleted_at is null
      and (
        j.primary_contact_id = c.id
        or c.id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
        or exists (
          select 1 from public.opportunities o
          where o.id = j.opportunity_id and o.primary_contact_id = c.id
        )
      )
  ) desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_contact');
  end if;

  if coalesce(p_handle, '') <> '' then
    select * into v_message
    from public.messages
    where company_id = v_contact.company_id and handle = p_handle
    limit 1;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_message.id);
    end if;
  end if;

  select j.*
  into v_job
  from public.jobs j
  where j.company_id = v_contact.company_id
    and j.deleted_at is null
    and (
      j.primary_contact_id = v_contact.id
      or v_contact.id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
      or exists (
        select 1 from public.opportunities o
        where o.id = j.opportunity_id and o.primary_contact_id = v_contact.id
      )
    )
  order by
    case j.status
      when 'in_progress' then 0
      when 'punch' then 1
      when 'precon' then 2
      when 'on_hold' then 3
      else 4
    end,
    j.start_date desc nulls last
  limit 1;

  if v_job.id is null then
    select o.id
    into v_opp_id
    from public.opportunities o
    where o.company_id = v_contact.company_id
      and o.primary_contact_id = v_contact.id
      and o.stage not in ('lost', 'unqualified')
    order by o.created_at desc
    limit 1;
  else
    v_opp_id := v_job.opportunity_id;
  end if;

  begin
    insert into public.messages (
      company_id,
      contact_id,
      job_id,
      opportunity_id,
      direction,
      phone,
      body,
      handle,
      status,
      media_url,
      imessage_kind,
      imessage_detail,
      created_at,
      created_by
    ) values (
      v_contact.company_id,
      v_contact.id,
      v_job.id,
      v_opp_id,
      'inbound',
      coalesce(nullif(trim(p_from), ''), v_contact.phone),
      v_body,
      coalesce(p_handle, ''),
      'received',
      coalesce(p_media_url, ''),
      coalesce(p_kind, ''),
      coalesce(p_detail, ''),
      v_created,
      v_contact.name
    )
    returning * into v_message;
  exception
    when unique_violation then
      select * into v_message
      from public.messages
      where company_id = v_contact.company_id
        and handle = coalesce(p_handle, '')
      limit 1;
      if found then
        return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_message.id);
      end if;
      raise;
  end;

  v_author := coalesce(nullif(trim(v_contact.name), ''), 'Homeowner');
  begin
    execute 'select $1::public.activity_type' into v_activity_type using 'text';
  exception
    when others then
      v_activity_type := 'call';
  end;

  if v_job.id is not null then
    insert into public.activities (
      company_id,
      entity_type,
      entity_id,
      type,
      body,
      author,
      created_at
    ) values (
      v_contact.company_id,
      'job',
      v_job.id,
      v_activity_type,
      format('%s texted:%s%s', v_author, chr(10), v_body),
      v_author,
      v_created
    );
  elsif v_opp_id is not null then
    insert into public.activities (
      company_id,
      entity_type,
      entity_id,
      type,
      body,
      author,
      created_at
    ) values (
      v_contact.company_id,
      'opportunity',
      v_opp_id,
      v_activity_type,
      format('%s texted:%s%s', v_author, chr(10), v_body),
      v_author,
      v_created
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_message.id,
    'jobId', v_message.job_id,
    'contactId', v_message.contact_id
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
      and o.stage::text not in ('lost', 'unqualified')
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

create or replace function public.shared_realtor_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.realtor_portal_invites%rowtype;
  company public.companies%rowtype;
  contact public.contacts%rowtype;
  v_token text;
  v_job_ids uuid[];
  v_owner_name text := '';
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);

  select * into inv
  from public.realtor_portal_invites
  where token = v_token
  limit 1;
  if not found then
    return null;
  end if;
  if not public.realtor_portal_invite_is_active(inv) then
    return null;
  end if;

  update public.realtor_portal_invites
  set last_opened_at = now()
  where id = inv.id;

  select * into company from public.companies where id = inv.company_id;
  select * into contact from public.contacts where id = inv.contact_id;
  if company.id is null or contact.id is null then
    return null;
  end if;
  if not coalesce(contact.is_referral_partner, false) then
    return null;
  end if;

  select coalesce(s.name, '') into v_owner_name
  from public.team_members s
  where s.id = contact.owner_staff_id
  limit 1;

  v_job_ids := public.realtor_jobs_for_contact(inv.company_id, inv.contact_id);

  return jsonb_build_object(
    'token', inv.token,
    'expiresAt', inv.expires_at,
    'company', jsonb_build_object(
      'name', coalesce(company.name, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'logoUrl', coalesce(company.logo_url, '')
    ),
    'contact', jsonb_build_object(
      'id', contact.id,
      'name', coalesce(contact.name, 'Partner'),
      'email', coalesce(contact.email, ''),
      'phone', coalesce(contact.phone, ''),
      'title', coalesce(contact.title, ''),
      'ownerName', v_owner_name,
      'listingWatchUrl', coalesce(contact.listing_watch_url, ''),
      'listingWatchEnabled', coalesce(contact.listing_watch_enabled, false)
    ),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'code', coalesce(o.code, ''),
        'name', coalesce(o.name, 'Referral'),
        'stage', coalesce(o.stage::text, ''),
        'value', coalesce(o.value, 0),
        'leadSource', coalesce(o.lead_source, ''),
        'createdAt', o.created_at,
        'location', coalesce(nullif(trim(both ', ' from concat_ws(', ',
          nullif(o.street, ''), nullif(o.city, ''), nullif(o.state, '')
        )), ''), coalesce(o.location, '')),
        'jobId', (
          select j.id
          from public.jobs j
          where j.company_id = inv.company_id
            and j.deleted_at is null
            and j.opportunity_id = o.id
          order by j.created_at desc
          limit 1
        )
      ) order by o.created_at desc)
      from public.opportunities o
      where o.company_id = inv.company_id
        and o.referral_contact_id = inv.contact_id
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'code', j.code,
        'name', j.name,
        'status', j.status,
        'location', coalesce(nullif(trim(both ', ' from concat_ws(', ',
          nullif(j.street, ''), nullif(j.city, ''), nullif(j.state, '')
        )), ''), j.location),
        'startDate', j.start_date,
        'projectManager', coalesce(j.project_manager, ''),
        'superintendent', coalesce(j.superintendent, ''),
        'salesRep', coalesce(j.sales_rep, ''),
        'assigned', to_jsonb(coalesce(j.assigned, '{}'::text[])),
        'schedule', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'kind', e.kind,
            'startsAt', e.starts_at,
            'endsAt', e.ends_at,
            'location', coalesce(e.location, ''),
            'assignee', coalesce(e.assignee, ''),
            'notes', coalesce(e.notes, '')
          ) order by e.starts_at)
          from public.schedule_events e
          where e.job_id = j.id
            and e.company_id = inv.company_id
            and e.starts_at >= (now() - interval '14 days')
        ), '[]'::jsonb)
      ) order by j.start_date desc nulls last, j.created_at desc)
      from public.jobs j
      where j.id = any (v_job_ids)
        and j.company_id = inv.company_id
        and j.deleted_at is null
    ), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'address', l.address,
        'city', l.city,
        'state', l.state,
        'postalCode', l.postal_code,
        'price', l.price,
        'status', l.status,
        'beds', l.beds,
        'baths', l.baths,
        'sqft', l.sqft,
        'listedAt', l.listed_at,
        'source', l.source,
        'sourceUrl', l.source_url,
        'summary', l.summary,
        'firstSeenAt', l.first_seen_at,
        'lastSeenAt', l.last_seen_at
      ) order by l.last_seen_at desc)
      from public.realtor_listings l
      where l.company_id = inv.company_id
        and l.contact_id = inv.contact_id
    ), '[]'::jsonb),
    'pipeline', jsonb_build_object(
      'watchEnabled', coalesce(contact.listing_watch_enabled, false),
      'watchUrl', coalesce(contact.listing_watch_url, ''),
      'activeListings', coalesce((
        select count(*)::int
        from public.realtor_listings l
        where l.contact_id = inv.contact_id
          and l.company_id = inv.company_id
          and l.status in ('active', 'pending', 'unknown')
      ), 0),
      'openReferrals', coalesce((
        select count(*)::int
        from public.opportunities o
        where o.referral_contact_id = inv.contact_id
          and o.company_id = inv.company_id
          and o.stage::text not in ('lost', 'unqualified', 'awarded')
      ), 0)
    )
  );
end;
$$;
