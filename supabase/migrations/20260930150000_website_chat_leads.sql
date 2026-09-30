-- A website chat collects a name, phone, and street, then opens an unassigned lead.
-- Company admins get a task. Assigning the lead later notifies that project manager.

alter table public.website_chats
  add column if not exists visitor_name text not null default '',
  add column if not exists visitor_phone text not null default '',
  add column if not exists visitor_street text not null default '',
  add column if not exists channel text not null default '',
  add column if not exists contact_id uuid,
  add column if not exists opportunity_id uuid,
  add column if not exists job_id uuid;

alter table public.website_chats drop constraint if exists website_chats_channel_check;
alter table public.website_chats
  add constraint website_chats_channel_check check (channel in ('', 'chat', 'text'));

create or replace function public.website_chat_read(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat public.website_chats%rowtype;
  v_company_name text;
  v_phone text;
begin
  select * into v_chat from public.website_chats where visitor_token = trim(coalesce(p_token, ''));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Start the chat again.');
  end if;

  select c.name, coalesce(c.phone, '') into v_company_name, v_phone
  from public.companies c
  where c.id = v_chat.company_id;

  return jsonb_build_object(
    'ok', true,
    'companyName', coalesce(v_company_name, ''),
    'phone', coalesce(v_phone, ''),
    'visitorName', v_chat.visitor_name,
    'visitorPhone', v_chat.visitor_phone,
    'visitorStreet', v_chat.visitor_street,
    'channel', v_chat.channel,
    'jobId', v_chat.job_id,
    'ready', v_chat.job_id is not null,
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'direction', m.direction,
          'body', m.body,
          'createdAt', m.created_at
        )
        order by m.created_at
      )
      from public.website_chat_messages m
      where m.chat_id = v_chat.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.website_chat_office_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  v_company := public.website_chat_member_company();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to see website chats.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'chats', coalesce((
      select jsonb_agg(item order by (item->>'updatedAt') desc)
      from (
        select jsonb_build_object(
          'id', c.id,
          'label', c.visitor_label,
          'updatedAt', c.updated_at,
          'preview', coalesce((
            select left(regexp_replace(m.body, '\s+', ' ', 'g'), 72)
            from public.website_chat_messages m
            where m.chat_id = c.id
            order by m.created_at desc
            limit 1
          ), ''),
          'jobId', c.job_id,
          'channel', c.channel,
          'messages', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', m.id,
                'direction', m.direction,
                'body', m.body,
                'createdAt', m.created_at
              )
              order by m.created_at
            )
            from public.website_chat_messages m
            where m.chat_id = c.id
          ), '[]'::jsonb)
        ) as item
        from public.website_chats c
        where c.company_id = v_company
        order by c.updated_at desc
        limit 40
      ) listed
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.website_chat_intake(
  p_token text,
  p_name text,
  p_phone text,
  p_street text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat public.website_chats%rowtype;
  v_company public.companies%rowtype;
  v_name text;
  v_phone text;
  v_street text;
  v_phone_key text;
  v_contact public.contacts%rowtype;
  v_created_contact boolean := false;
  v_state text;
  v_code text;
  v_lead_name text;
  v_opp_id uuid;
  v_job_id uuid;
  v_at timestamptz;
  v_note text;
begin
  select * into v_chat from public.website_chats where visitor_token = trim(coalesce(p_token, ''));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Start the chat again.');
  end if;

  if v_chat.job_id is not null then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'jobId', v_chat.job_id,
      'opportunityId', v_chat.opportunity_id,
      'contactId', v_chat.contact_id,
      'channel', v_chat.channel,
      'visitorName', v_chat.visitor_name,
      'visitorPhone', v_chat.visitor_phone,
      'visitorStreet', v_chat.visitor_street
    );
  end if;

  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_phone := trim(coalesce(p_phone, ''));
  v_street := regexp_replace(trim(coalesce(p_street, '')), '\s+', ' ', 'g');
  v_phone_key := public.voice_phone_key(v_phone);

  if char_length(v_name) < 2 or char_length(v_name) > 80 or v_name !~ '[A-Za-z]' then
    return jsonb_build_object('ok', false, 'error', 'Enter your name.');
  end if;
  if length(v_phone_key) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Enter a phone number.');
  end if;
  if char_length(v_street) < 5 or char_length(v_street) > 160 then
    return jsonb_build_object('ok', false, 'error', 'Enter the street address.');
  end if;

  select * into v_company from public.companies where id = v_chat.company_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That office was not found.');
  end if;

  select * into v_contact
  from public.contacts c
  where c.company_id = v_chat.company_id
    and public.voice_phone_key(c.phone) = v_phone_key
  limit 1;

  if not found then
    insert into public.contacts (
      company_id, name, title, email, phone, is_referral_partner
    ) values (
      v_chat.company_id, v_name, 'Homeowner', '', v_phone, false
    )
    returning * into v_contact;
    v_created_contact := true;
  end if;

  v_state := coalesce(nullif(trim(v_company.state), ''), 'TX');
  v_code := public.voice_next_job_code(v_chat.company_id, 'Website Chat');
  v_lead_name := v_name || ' — ' || v_street;
  v_note := 'Started in the website chat. ' || v_name || ', ' || v_phone || ', ' || v_street || '.';

  insert into public.opportunities (
    company_id, name, primary_contact_id, stage, value, location,
    project_type, market, delivery_method, estimator, owner_staff_id, originator_staff_id,
    win_probability, next_step, code, lead_source, source, street, city, state, postal_code, notes,
    workflow_status
  ) values (
    v_chat.company_id,
    v_lead_name,
    v_contact.id,
    'pursuing',
    0,
    v_street,
    'roofing',
    'residential',
    'fixed_price',
    '',
    null,
    null,
    20,
    'Assign this website lead.',
    v_code,
    'website',
    'website',
    v_street,
    '',
    v_state,
    '',
    v_note,
    'new_lead'
  )
  returning id into v_opp_id;

  insert into public.jobs (
    company_id, opportunity_id, name, primary_contact_id, status, contract_value,
    start_date, project_manager, location, owner_staff_id, code, description,
    street, city, state, postal_code, project_type, market, lead_source
  ) values (
    v_chat.company_id,
    v_opp_id,
    v_lead_name,
    v_contact.id,
    'precon',
    0,
    current_date,
    '',
    v_street,
    null,
    v_code,
    v_note,
    v_street,
    '',
    v_state,
    '',
    'roofing',
    'residential',
    'website'
  )
  returning id into v_job_id;

  update public.website_chats
  set
    visitor_name = v_name,
    visitor_phone = v_phone,
    visitor_street = v_street,
    visitor_label = v_name,
    contact_id = v_contact.id,
    opportunity_id = v_opp_id,
    job_id = v_job_id,
    updated_at = clock_timestamp()
  where id = v_chat.id;

  v_at := clock_timestamp();
  insert into public.website_chat_messages (chat_id, company_id, direction, body, created_at)
  values
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s your name?', v_at),
    (v_chat.id, v_chat.company_id, 'inbound', v_name, v_at + interval '1 millisecond'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s the best phone number to reach you?', v_at + interval '2 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_phone, v_at + interval '3 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s the street address?', v_at + interval '4 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_street, v_at + interval '5 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'Thanks. You can keep talking here, or move this over to a text.', v_at + interval '6 milliseconds');

  insert into public.activities (company_id, entity_type, entity_id, type, body, author)
  values (
    v_chat.company_id,
    'job',
    v_job_id,
    'note',
    v_note || ' Waiting for a company admin to assign it.',
    'Website chat'
  );

  insert into public.tasks (company_id, title, due_at, related_type, related_id, assignee, notes)
  select
    v_chat.company_id,
    'New website conversation: ' || v_name,
    current_date,
    'job',
    v_job_id,
    m.name,
    v_name || ' · ' || v_phone || ' · ' || v_street || '. Assign this lead when you are ready.'
  from public.team_members m
  where m.company_id = v_chat.company_id
    and m.role = 'company_admin'
    and not m.locked
    and (
      not m.restricted
      or not exists (
        select 1
        from public.team_members open_admin
        where open_admin.company_id = v_chat.company_id
          and open_admin.role = 'company_admin'
          and not open_admin.locked
          and not open_admin.restricted
      )
    );

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'jobId', v_job_id,
    'opportunityId', v_opp_id,
    'contactId', v_contact.id,
    'jobCode', v_code,
    'createdContact', v_created_contact,
    'visitorName', v_name,
    'visitorPhone', v_phone,
    'visitorStreet', v_street,
    'companyName', v_company.name,
    'companyEmail', coalesce(v_company.email, ''),
    'companyPhone', coalesce(v_company.phone, ''),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object('name', m.name, 'email', m.email))
      from public.team_members m
      where m.company_id = v_chat.company_id
        and m.role = 'company_admin'
        and not m.locked
        and (
          not m.restricted
          or not exists (
            select 1
            from public.team_members open_admin
            where open_admin.company_id = v_chat.company_id
              and open_admin.role = 'company_admin'
              and not open_admin.locked
              and not open_admin.restricted
          )
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.website_chat_choose(p_token text, p_channel text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat public.website_chats%rowtype;
  v_channel text;
  v_phone text;
  v_body text;
begin
  v_channel := lower(trim(coalesce(p_channel, '')));
  if v_channel not in ('chat', 'text') then
    return jsonb_build_object('ok', false, 'error', 'Pick chat or text.');
  end if;

  select * into v_chat from public.website_chats where visitor_token = trim(coalesce(p_token, ''));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Start the chat again.');
  end if;
  if v_chat.job_id is null then
    return jsonb_build_object('ok', false, 'error', 'Tell us your name, phone, and street first.');
  end if;

  if v_chat.channel = '' then
    v_body := case
      when v_channel = 'text' then 'Text me instead.'
      else 'I''ll keep talking here.'
    end;
    insert into public.website_chat_messages (chat_id, company_id, direction, body)
    values (v_chat.id, v_chat.company_id, 'inbound', v_body);
  end if;

  update public.website_chats
  set channel = v_channel, updated_at = clock_timestamp()
  where id = v_chat.id;

  select coalesce(phone, '') into v_phone from public.companies where id = v_chat.company_id;

  return jsonb_build_object(
    'ok', true,
    'channel', v_channel,
    'phone', coalesce(v_phone, ''),
    'visitorName', v_chat.visitor_name,
    'visitorStreet', v_chat.visitor_street
  );
end;
$$;

revoke all on function public.website_chat_read(text) from public;
revoke all on function public.website_chat_office_list() from public;
revoke all on function public.website_chat_intake(text, text, text, text) from public;
revoke all on function public.website_chat_choose(text, text) from public;

grant execute on function public.website_chat_read(text) to anon, authenticated;
grant execute on function public.website_chat_office_list() to authenticated;
grant execute on function public.website_chat_intake(text, text, text, text) to anon, authenticated;
grant execute on function public.website_chat_choose(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
