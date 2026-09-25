-- myCRMSIM replaces Sendblue for outbound texts and inbound replies.
-- One workspace (location id) per company. Safe to re-run.

create table if not exists public.mycrmsim_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  location_id text not null default '',
  channel text not null default 'sms',
  webhook_token text not null default '',
  linked boolean not null default false,
  linked_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mycrmsim_channel_check check (channel in ('sms', 'imessage', 'whatsapp', 'rcs'))
);

alter table public.mycrmsim_connections add column if not exists location_id text;
alter table public.mycrmsim_connections add column if not exists channel text;
alter table public.mycrmsim_connections add column if not exists webhook_token text;
alter table public.mycrmsim_connections add column if not exists linked boolean;
alter table public.mycrmsim_connections add column if not exists linked_at timestamptz;
alter table public.mycrmsim_connections add column if not exists updated_at timestamptz;
alter table public.mycrmsim_connections add column if not exists created_at timestamptz;

update public.mycrmsim_connections set location_id = coalesce(location_id, '') where location_id is null;
update public.mycrmsim_connections set channel = coalesce(nullif(channel, ''), 'sms') where channel is null or channel = '';
update public.mycrmsim_connections set webhook_token = coalesce(webhook_token, '') where webhook_token is null;
update public.mycrmsim_connections set linked = coalesce(linked, false) where linked is null;
update public.mycrmsim_connections set updated_at = coalesce(updated_at, now()) where updated_at is null;
update public.mycrmsim_connections set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.mycrmsim_connections alter column location_id set default '';
alter table public.mycrmsim_connections alter column location_id set not null;
alter table public.mycrmsim_connections alter column channel set default 'sms';
alter table public.mycrmsim_connections alter column channel set not null;
alter table public.mycrmsim_connections alter column webhook_token set default '';
alter table public.mycrmsim_connections alter column webhook_token set not null;
alter table public.mycrmsim_connections alter column linked set default false;
alter table public.mycrmsim_connections alter column linked set not null;
alter table public.mycrmsim_connections alter column updated_at set default now();
alter table public.mycrmsim_connections alter column updated_at set not null;
alter table public.mycrmsim_connections alter column created_at set default now();
alter table public.mycrmsim_connections alter column created_at set not null;

do $$
begin
  alter table public.mycrmsim_connections
    add constraint mycrmsim_channel_check check (channel in ('sms', 'imessage', 'whatsapp', 'rcs'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists mycrmsim_location_idx
  on public.mycrmsim_connections (location_id)
  where location_id <> '';

alter table public.mycrmsim_connections enable row level security;

drop policy if exists "company isolation" on public.mycrmsim_connections;
create policy "company isolation" on public.mycrmsim_connections
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.mycrmsim_connections to authenticated;

create or replace function public.mycrmsim_outbound_config(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_location text;
  v_channel text;
begin
  if p_company_id is null then
    return jsonb_build_object('ok', false, 'configured', false, 'error', 'Missing company.');
  end if;
  if auth.uid() is not null and public.current_company_id() is distinct from p_company_id then
    return jsonb_build_object('ok', false, 'configured', false, 'error', 'Wrong company.');
  end if;

  select c.location_id, c.channel
    into v_location, v_channel
  from public.mycrmsim_connections c
  where c.company_id = p_company_id
    and c.linked
    and coalesce(c.location_id, '') <> ''
  limit 1;

  if coalesce(v_location, '') = '' then
    if exists (
      select 1 from public.mycrmsim_connections c where c.company_id = p_company_id
    ) then
      return jsonb_build_object('ok', true, 'configured', false, 'missing', false);
    end if;
    return jsonb_build_object('ok', true, 'configured', false, 'missing', true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'configured', true,
    'locationId', v_location,
    'channel', coalesce(nullif(v_channel, ''), 'sms')
  );
end;
$$;

revoke all on function public.mycrmsim_outbound_config(uuid) from public;
grant execute on function public.mycrmsim_outbound_config(uuid) to anon, authenticated;

create or replace function public.mycrmsim_config_for_voice(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_staff text;
  v_location text;
  v_channel text;
begin
  select a.company_id, a.staff_id::text
    into v_company, v_staff
  from public.voice_agents a
  where a.webhook_token = trim(coalesce(p_token, ''))
    and a.enabled
  limit 1;

  if v_company is null then
    return jsonb_build_object('ok', false, 'configured', false, 'error', 'Unknown voice agent.');
  end if;

  select c.location_id, c.channel
    into v_location, v_channel
  from public.mycrmsim_connections c
  where c.company_id = v_company
    and c.linked
    and coalesce(c.location_id, '') <> ''
  limit 1;

  if coalesce(v_location, '') = '' then
    if exists (
      select 1 from public.mycrmsim_connections c where c.company_id = v_company
    ) then
      return jsonb_build_object('ok', true, 'configured', false, 'missing', false, 'companyId', v_company);
    end if;
    return jsonb_build_object('ok', true, 'configured', false, 'missing', true, 'companyId', v_company);
  end if;

  return jsonb_build_object(
    'ok', true,
    'configured', true,
    'companyId', v_company,
    'userId', coalesce(v_staff, ''),
    'locationId', v_location,
    'channel', coalesce(nullif(v_channel, ''), 'sms')
  );
end;
$$;

revoke all on function public.mycrmsim_config_for_voice(text) from public;
grant execute on function public.mycrmsim_config_for_voice(text) to anon, authenticated;

-- Inbound MESSAGE, STATUS-UPDATE, and CALL events from a myCRMSIM workspace webhook.
create or replace function public.ingest_mycrmsim_event(
  p_location_id text,
  p_token text,
  p_kind text,
  p_phone text default '',
  p_body text default '',
  p_message_id text default '',
  p_status text default '',
  p_is_me boolean default false,
  p_media_url text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_token text;
  v_kind text;
  v_digits text;
  v_contact public.contacts%rowtype;
  v_job public.jobs%rowtype;
  v_opp_id uuid;
  v_message public.messages%rowtype;
  v_author text;
  v_body text;
  v_status text;
  v_activity_type public.activity_type := 'call';
  v_updated uuid;
begin
  select c.company_id, c.webhook_token
    into v_company, v_token
  from public.mycrmsim_connections c
  where c.location_id = trim(coalesce(p_location_id, ''))
    and c.linked
  limit 1;

  if v_company is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'unknown_location');
  end if;

  if coalesce(v_token, '') <> '' and v_token is distinct from trim(coalesce(p_token, '')) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized.');
  end if;

  v_kind := lower(trim(coalesce(p_kind, '')));

  if v_kind = 'status' then
    v_status := lower(trim(coalesce(p_status, '')));
    if v_status not in ('sent', 'delivered', 'failed') then
      v_status := 'sent';
    end if;
    if coalesce(trim(p_message_id), '') = '' then
      return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'missing_message_id');
    end if;
    update public.messages
      set status = v_status
      where company_id = v_company
        and handle = trim(p_message_id)
      returning id into v_updated;
    if v_updated is null then
      return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'unknown_message');
    end if;
    return jsonb_build_object('ok', true, 'id', v_updated, 'status', v_status);
  end if;

  v_digits := public.phone_last10(p_phone);
  if length(v_digits) < 10 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'bad_phone');
  end if;

  select c.*
    into v_contact
  from public.contacts c
  where c.company_id = v_company
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

  if v_kind = 'call' then
    v_body := trim(coalesce(p_body, ''));
    if v_body = '' then
      v_body := 'Call logged from myCRMSIM.';
    end if;
    v_author := coalesce(nullif(trim(v_contact.name), ''), 'Homeowner');
    select j.*
      into v_job
    from public.jobs j
    where j.company_id = v_company
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

    if v_job.id is not null then
      insert into public.activities (company_id, entity_type, entity_id, type, body, author)
      values (v_company, 'job', v_job.id, 'call', format('%s — %s', v_author, v_body), v_author);
    else
      select o.id
        into v_opp_id
      from public.opportunities o
      where o.company_id = v_company
        and o.primary_contact_id = v_contact.id
        and o.stage <> 'lost'
      order by o.created_at desc
      limit 1;
      if v_opp_id is not null then
        insert into public.activities (company_id, entity_type, entity_id, type, body, author)
        values (v_company, 'opportunity', v_opp_id, 'call', format('%s — %s', v_author, v_body), v_author);
      end if;
    end if;
    return jsonb_build_object('ok', true, 'kind', 'call', 'contactId', v_contact.id);
  end if;

  if coalesce(p_is_me, false) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'echo');
  end if;

  v_body := trim(coalesce(p_body, ''));
  if v_body = '' and trim(coalesce(p_media_url, '')) <> '' then
    v_body := '(photo or attachment)';
  end if;
  if v_body = '' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'empty');
  end if;

  if coalesce(trim(p_message_id), '') <> '' then
    select * into v_message
    from public.messages
    where company_id = v_company and handle = trim(p_message_id)
    limit 1;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_message.id);
    end if;
  end if;

  select j.*
    into v_job
  from public.jobs j
  where j.company_id = v_company
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
    where o.company_id = v_company
      and o.primary_contact_id = v_contact.id
      and o.stage <> 'lost'
    order by o.created_at desc
    limit 1;
  else
    v_opp_id := v_job.opportunity_id;
  end if;

  insert into public.messages (
    company_id, contact_id, job_id, opportunity_id, direction, phone, body, handle, status, media_url, created_by
  ) values (
    v_company,
    v_contact.id,
    v_job.id,
    v_opp_id,
    'inbound',
    coalesce(nullif(trim(p_phone), ''), v_contact.phone),
    v_body,
    coalesce(trim(p_message_id), ''),
    'received',
    coalesce(p_media_url, ''),
    v_contact.name
  )
  returning * into v_message;

  v_author := coalesce(nullif(trim(v_contact.name), ''), 'Homeowner');
  begin
    execute 'select $1::public.activity_type' into v_activity_type using 'text';
  exception
    when others then
      v_activity_type := 'call';
  end;

  if v_job.id is not null then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (
      v_company,
      'job',
      v_job.id,
      v_activity_type,
      format('%s texted:%s%s', v_author, chr(10), v_body),
      v_author
    );
  elsif v_opp_id is not null then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (
      v_company,
      'opportunity',
      v_opp_id,
      v_activity_type,
      format('%s texted:%s%s', v_author, chr(10), v_body),
      v_author
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

revoke all on function public.ingest_mycrmsim_event(text, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.ingest_mycrmsim_event(text, text, text, text, text, text, text, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';
