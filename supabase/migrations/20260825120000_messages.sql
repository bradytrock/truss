-- Two-way texts (Sendblue) logged on the related job as communication.

alter type public.activity_type add value if not exists 'text';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  direction text not null default 'outbound',
  phone text not null default '',
  body text not null default '',
  handle text not null default '',
  status text not null default 'sent',
  media_url text not null default '',
  created_at timestamptz not null default now(),
  created_by text not null default '',
  constraint messages_direction_check check (direction in ('inbound', 'outbound'))
);

create index if not exists messages_company_created_idx on public.messages (company_id, created_at desc);
create index if not exists messages_job_id_idx on public.messages (job_id);
create index if not exists messages_contact_id_idx on public.messages (contact_id);
create unique index if not exists messages_company_handle_idx
  on public.messages (company_id, handle)
  where handle <> '';

alter table public.messages enable row level security;

drop policy if exists "company isolation" on public.messages;
create policy "company isolation" on public.messages
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.messages';
  exception
    when duplicate_object then null;
  end;
end $$;

create or replace function public.phone_last10(value text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(value, ''), '\D', '', 'g'), 10);
$$;

create or replace function public.ingest_inbound_text(
  p_from text,
  p_body text,
  p_handle text default '',
  p_media_url text default '',
  p_sent_at text default null
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
  v_activity_type public.activity_type;
begin
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
  where public.phone_last10(c.phone) = v_digits
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
    v_activity_type := 'text';
  exception
    when invalid_text_representation then
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

grant select, insert, update, delete on public.messages to authenticated;

revoke all on function public.ingest_inbound_text(text, text, text, text, text) from public;
grant execute on function public.ingest_inbound_text(text, text, text, text, text) to anon, authenticated;
grant execute on function public.phone_last10(text) to anon, authenticated;
