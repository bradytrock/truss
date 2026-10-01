-- iMessage add-ons: keep the kind (effect, reaction, edit, unsend, poll, …)
-- beside the words, and rewrite the original row when Photon sends an edit or unsend.
-- Safe to re-run.

alter table public.messages add column if not exists imessage_kind text;
alter table public.messages add column if not exists imessage_detail text;
update public.messages set imessage_kind = coalesce(imessage_kind, '') where imessage_kind is null;
update public.messages set imessage_detail = coalesce(imessage_detail, '') where imessage_detail is null;
alter table public.messages alter column imessage_kind set default '';
alter table public.messages alter column imessage_detail set default '';
alter table public.messages alter column imessage_kind set not null;
alter table public.messages alter column imessage_detail set not null;

drop function if exists public.ingest_inbound_text(text, text, text, text, text, uuid);

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

create or replace function public.apply_imessage_revision(
  p_company_id uuid,
  p_handle text,
  p_body text,
  p_kind text default '',
  p_detail text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages%rowtype;
  v_body text;
  v_kind text;
begin
  if p_company_id is null or coalesce(trim(p_handle), '') = '' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'not_found');
  end if;

  v_kind := coalesce(trim(p_kind), '');
  v_body := trim(coalesce(p_body, ''));
  if v_body = '' and v_kind = 'unsend' then
    v_body := 'Message unsent';
  end if;
  if v_body = '' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'empty');
  end if;

  update public.messages
  set
    body = v_body,
    imessage_kind = case when v_kind <> '' then v_kind else imessage_kind end,
    imessage_detail = case when coalesce(trim(p_detail), '') <> '' then trim(p_detail) else imessage_detail end,
    status = case when v_kind = 'unsend' then 'unsent' else status end
  where company_id = p_company_id
    and handle = trim(p_handle)
  returning * into v_message;

  if not found then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'revised', true, 'id', v_message.id);
end;
$$;

revoke all on function public.ingest_inbound_text(text, text, text, text, text, uuid, text, text) from public;
revoke all on function public.apply_imessage_revision(uuid, text, text, text, text) from public;

grant execute on function public.ingest_inbound_text(text, text, text, text, text, uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.apply_imessage_revision(uuid, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
