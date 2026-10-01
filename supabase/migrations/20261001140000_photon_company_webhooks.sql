-- Each office gets its own inbound text webhook. The token in the URL
-- picks the company. A phone match cannot cross into another office.
-- Safe to re-run.

alter table public.photon_connections add column if not exists webhook_token text;
update public.photon_connections set webhook_token = coalesce(webhook_token, '') where webhook_token is null;
alter table public.photon_connections alter column webhook_token set default '';
alter table public.photon_connections alter column webhook_token set not null;

create unique index if not exists photon_connections_webhook_token_idx
  on public.photon_connections (webhook_token)
  where webhook_token <> '';

create or replace function public.photon_mint_webhook_token(p_company uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if p_company is null then
    return '';
  end if;
  select webhook_token into v_token
  from public.photon_connections
  where company_id = p_company;
  if found and coalesce(v_token, '') <> '' then
    return v_token;
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.photon_connections (company_id, webhook_token)
  values (p_company, v_token)
  on conflict (company_id) do update
  set
    webhook_token = case
      when public.photon_connections.webhook_token <> '' then public.photon_connections.webhook_token
      else excluded.webhook_token
    end,
    updated_at = now()
  returning webhook_token into v_token;
  return coalesce(v_token, '');
end;
$$;

create or replace function public.photon_company_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_name text;
  conn public.photon_connections%rowtype;
  v_found boolean := false;
  v_token text;
begin
  v_company := public.photon_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can view Photon settings.');
  end if;
  select companies.name into v_name from public.companies where id = v_company;
  v_token := public.photon_mint_webhook_token(v_company);
  select * into conn from public.photon_connections where company_id = v_company;
  v_found := found;
  return jsonb_build_object(
    'ok', true,
    'linked', case when v_found then conn.linked and conn.project_id <> '' and conn.project_secret <> '' else false end,
    'companyName', coalesce(v_name, ''),
    'projectId', case when v_found then conn.project_id else '' end,
    'projectName', case when v_found then conn.project_name else '' end,
    'secretHint', case when v_found then conn.secret_hint else '' end,
    'linkedAt', case when v_found then conn.linked_at else null end,
    'webhookToken', coalesce(v_token, '')
  );
end;
$$;

create or replace function public.photon_inbound_company(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  conn public.photon_connections%rowtype;
begin
  if length(trim(coalesce(p_token, ''))) < 24 then
    return jsonb_build_object('ok', false, 'error', 'Unknown webhook.');
  end if;
  select * into conn
  from public.photon_connections
  where webhook_token = trim(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown webhook.');
  end if;
  if not (conn.linked and conn.project_id <> '' and conn.project_secret <> '') then
    return jsonb_build_object('ok', false, 'error', 'Photon is not connected for this company.');
  end if;
  return jsonb_build_object('ok', true, 'companyId', conn.company_id);
end;
$$;

drop function if exists public.ingest_inbound_text(text, text, text, text, text);

create or replace function public.ingest_inbound_text(
  p_from text,
  p_body text,
  p_handle text default '',
  p_media_url text default '',
  p_sent_at text default null,
  p_company_id uuid default null
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
      and o.stage <> 'lost'
    order by o.created_at desc
    limit 1;
  else
    v_opp_id := v_job.opportunity_id;
  end if;

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
    v_created,
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

revoke all on function public.photon_mint_webhook_token(uuid) from public;
revoke all on function public.photon_company_status() from public;
revoke all on function public.photon_inbound_company(text) from public;
revoke all on function public.ingest_inbound_text(text, text, text, text, text, uuid) from public;

grant execute on function public.photon_company_status() to authenticated;
grant execute on function public.photon_inbound_company(text) to anon, authenticated, service_role;
grant execute on function public.ingest_inbound_text(text, text, text, text, text, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
