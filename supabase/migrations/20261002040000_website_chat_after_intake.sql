-- A website chat is created only after the lead answers are complete.
-- Opening the widget no longer leaves a blank conversation in the inbox.
-- Safe to re-run.

create or replace function public.website_chat_office_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_staff uuid;
begin
  v_company := public.website_chat_member_company();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to see website chats.');
  end if;
  v_staff := public.current_staff_id();

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
          and c.job_id is not null
          and (c.owner_staff_id is null or c.owner_staff_id = v_staff)
        order by c.updated_at desc
        limit 40
      ) listed
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.website_chat_office_list() from public;
grant execute on function public.website_chat_office_list() to authenticated;

-- Visitors who opened the widget and left never became a lead.
delete from public.website_chats where job_id is null;

drop function if exists public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.website_chat_intake(
  p_token text,
  p_name text,
  p_phone text,
  p_street text,
  p_email text default '',
  p_city text default '',
  p_state text default '',
  p_postal text default '',
  p_market text default 'residential',
  p_trades text default '',
  p_first text default '',
  p_last text default '',
  p_slug text default '',
  p_owner text default ''
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
  v_first text;
  v_last text;
  v_phone text;
  v_email text;
  v_street text;
  v_city text;
  v_state text;
  v_postal text;
  v_market text;
  v_trades text;
  v_project public.project_type;
  v_tags text[];
  v_phone_key text;
  v_contact public.contacts%rowtype;
  v_created_contact boolean := false;
  v_code text;
  v_site text;
  v_lead_name text;
  v_opp_id uuid;
  v_job_id uuid;
  v_at timestamptz;
  v_note text;
  v_trade text;
  v_owner public.team_members%rowtype;
  v_assigned boolean := false;
  v_token text;
  v_owner_id uuid;
  v_owner_raw text;
begin
  v_token := trim(coalesce(p_token, ''));
  if v_token <> '' then
    select * into v_chat from public.website_chats where visitor_token = v_token;
  end if;

  if v_chat.id is not null and v_chat.job_id is not null then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'token', v_chat.visitor_token,
      'jobId', v_chat.job_id,
      'opportunityId', v_chat.opportunity_id,
      'contactId', v_chat.contact_id,
      'channel', v_chat.channel,
      'visitorName', v_chat.visitor_name,
      'visitorPhone', v_chat.visitor_phone,
      'visitorStreet', v_chat.visitor_street
    );
  end if;

  v_first := regexp_replace(trim(coalesce(p_first, '')), '\s+', ' ', 'g');
  v_last := regexp_replace(trim(coalesce(p_last, '')), '\s+', ' ', 'g');
  if v_first = '' or v_last = '' then
    v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  else
    v_name := v_first || ' ' || v_last;
  end if;
  v_phone := trim(coalesce(p_phone, ''));
  v_email := lower(trim(coalesce(p_email, '')));
  v_street := regexp_replace(trim(coalesce(p_street, '')), '\s+', ' ', 'g');
  v_city := regexp_replace(trim(coalesce(p_city, '')), '\s+', ' ', 'g');
  v_state := upper(trim(coalesce(p_state, '')));
  v_postal := trim(coalesce(p_postal, ''));
  v_market := lower(trim(coalesce(p_market, 'residential')));
  v_phone_key := public.voice_phone_key(v_phone);

  if char_length(v_name) < 2 or char_length(v_name) > 120 or v_name !~ '[A-Za-z]' then
    return jsonb_build_object('ok', false, 'error', 'Enter your name.');
  end if;
  if length(v_phone_key) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Enter a phone number.');
  end if;
  if v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'error', 'Enter an email address.');
  end if;
  if char_length(v_street) < 5 or char_length(v_street) > 160 then
    return jsonb_build_object('ok', false, 'error', 'Enter the street address.');
  end if;
  if char_length(v_city) < 2 or char_length(v_city) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Enter the city.');
  end if;
  if v_state !~ '^[A-Z]{2}$' then
    return jsonb_build_object('ok', false, 'error', 'Enter the state.');
  end if;
  if v_postal !~ '^[0-9]{5}(-[0-9]{4})?$' then
    return jsonb_build_object('ok', false, 'error', 'Enter the ZIP code.');
  end if;
  if v_market not in ('residential', 'commercial') then
    return jsonb_build_object('ok', false, 'error', 'Choose residential or commercial.');
  end if;

  v_tags := array[]::text[];
  v_trades := '';
  for v_trade in
    select trim(part)
    from unnest(string_to_array(coalesce(p_trades, ''), ',')) as part
    where trim(part) <> ''
  loop
    if v_trade not in ('Fencing', 'Roofing', 'Gutters', 'Siding', 'Flooring', 'Other') then
      return jsonb_build_object('ok', false, 'error', 'Pick the trades involved.');
    end if;
    if not (v_trade = any(v_tags)) then
      v_tags := array_append(v_tags, v_trade);
    end if;
  end loop;
  if cardinality(v_tags) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Pick the trades involved.');
  end if;
  v_trades := array_to_string(v_tags, ', ');

  v_project := case
    when v_market = 'commercial' then 'commercial'::public.project_type
    when v_trades = 'Roofing' then 'roofing'::public.project_type
    when v_trades = 'Flooring' then 'remodel'::public.project_type
    when v_trades <> '' and v_trades !~ 'Roofing|Flooring|Other' then 'exterior'::public.project_type
    else 'restoration'::public.project_type
  end;

  if v_chat.id is null then
    select * into v_company
    from public.companies
    where lower(slug) = lower(trim(coalesce(p_slug, '')))
    limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'That office was not found.');
    end if;

    v_owner_raw := trim(coalesce(p_owner, ''));
    v_owner_id := null;
    if v_owner_raw <> '' then
      if v_owner_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return jsonb_build_object('ok', false, 'error', 'That person is not on this office.');
      end if;
      select m.id into v_owner_id
      from public.team_members m
      where m.id = v_owner_raw::uuid
        and m.company_id = v_company.id
        and not m.locked;
      if v_owner_id is null then
        return jsonb_build_object('ok', false, 'error', 'That person is not on this office.');
      end if;
    end if;

    if v_token !~ '^[0-9a-f]{48}$' then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
    end if;

    insert into public.website_chats (company_id, visitor_token, owner_staff_id)
    values (v_company.id, v_token, v_owner_id)
    returning * into v_chat;
  end if;

  select * into v_company from public.companies where id = v_chat.company_id;
  if not found then
    -- Raising rolls the new chat back. A normal return would leave a blank row.
    raise exception 'That office was not found.';
  end if;

  if v_chat.owner_staff_id is not null then
    select * into v_owner
    from public.team_members
    where id = v_chat.owner_staff_id
      and company_id = v_chat.company_id
      and not locked;
    v_assigned := found;
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
      v_chat.company_id, v_name, 'Homeowner', v_email, v_phone, false
    )
    returning * into v_contact;
    v_created_contact := true;
  elsif v_email <> '' and coalesce(v_contact.email, '') = '' then
    update public.contacts set email = v_email where id = v_contact.id;
  end if;

  v_site := v_street || ', ' || v_city || ', ' || v_state || ' ' || v_postal;
  v_code := public.voice_next_job_code(v_chat.company_id, 'Website Chat');
  v_lead_name := coalesce(nullif(v_last, ''), v_name) || ' — ' || v_site;
  v_note := 'Started in the website chat. '
    || case when v_market = 'commercial' then 'Commercial' else 'Residential' end
    || '. Trades: ' || v_trades || '. '
    || v_name || ', ' || v_phone
    || case when v_email <> '' then ', ' || v_email else '' end
    || ', ' || v_site || '.';
  if v_assigned then
    v_note := v_note || ' Assigned to ' || v_owner.name || '.';
  end if;

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
    v_site,
    v_project,
    v_market,
    'fixed_price',
    '',
    case when v_assigned then v_owner.id else null end,
    case when v_assigned then v_owner.id else null end,
    20,
    case when v_assigned then 'Call this website lead.' else 'Assign this website lead.' end,
    v_code,
    'website',
    'website',
    v_street,
    v_city,
    v_state,
    v_postal,
    v_note,
    'new_lead'
  )
  returning id into v_opp_id;

  insert into public.jobs (
    company_id, opportunity_id, name, primary_contact_id, status, contract_value,
    start_date, project_manager, location, owner_staff_id, code, description,
    street, city, state, postal_code, project_type, market, lead_source, trades
  ) values (
    v_chat.company_id,
    v_opp_id,
    v_lead_name,
    v_contact.id,
    'precon',
    0,
    current_date,
    case when v_assigned then v_owner.name else '' end,
    v_site,
    case when v_assigned then v_owner.id else null end,
    v_code,
    v_note,
    v_street,
    v_city,
    v_state,
    v_postal,
    v_project,
    v_market,
    'website',
    v_tags
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
    (v_chat.id, v_chat.company_id, 'outbound', 'Is this residential or commercial?', v_at),
    (v_chat.id, v_chat.company_id, 'inbound', case when v_market = 'commercial' then 'Commercial' else 'Residential' end, v_at + interval '1 millisecond'),
    (v_chat.id, v_chat.company_id, 'outbound', 'Which trades are involved?', v_at + interval '2 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_trades, v_at + interval '3 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s your first name?', v_at + interval '4 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', coalesce(nullif(v_first, ''), v_name), v_at + interval '5 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s your last name?', v_at + interval '6 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', coalesce(nullif(v_last, ''), v_name), v_at + interval '7 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s the best phone number to reach you?', v_at + interval '8 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_phone, v_at + interval '9 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s your email?', v_at + interval '10 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', case when v_email <> '' then v_email else 'No email' end, v_at + interval '11 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s the street address?', v_at + interval '12 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_street, v_at + interval '13 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What city?', v_at + interval '14 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_city, v_at + interval '15 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What state?', v_at + interval '16 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_state, v_at + interval '17 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'What''s the ZIP code?', v_at + interval '18 milliseconds'),
    (v_chat.id, v_chat.company_id, 'inbound', v_postal, v_at + interval '19 milliseconds'),
    (v_chat.id, v_chat.company_id, 'outbound', 'Thanks. You can keep talking here, or move this over to a text.', v_at + interval '20 milliseconds');

  insert into public.activities (company_id, entity_type, entity_id, type, body, author)
  values (
    v_chat.company_id,
    'job',
    v_job_id,
    'note',
    v_note || case when v_assigned then '' else ' Waiting for a company admin to assign it.' end,
    'Website chat'
  );

  if v_assigned then
    insert into public.tasks (company_id, title, due_at, related_type, related_id, assignee, notes)
    values (
      v_chat.company_id,
      'New website conversation: ' || v_name,
      current_date,
      'job',
      v_job_id,
      v_owner.name,
      v_note || ' This lead is in your pipeline.'
    );
  else
    insert into public.tasks (company_id, title, due_at, related_type, related_id, assignee, notes)
    select
      v_chat.company_id,
      'New website conversation: ' || v_name,
      current_date,
      'job',
      v_job_id,
      m.name,
      v_note || ' Assign this lead when you are ready.'
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'token', v_chat.visitor_token,
    'jobId', v_job_id,
    'opportunityId', v_opp_id,
    'contactId', v_contact.id,
    'jobCode', v_code,
    'createdContact', v_created_contact,
    'visitorName', v_name,
    'visitorPhone', v_phone,
    'visitorStreet', v_street,
    'visitorEmail', v_email,
    'visitorCity', v_city,
    'visitorState', v_state,
    'visitorPostal', v_postal,
    'market', v_market,
    'trades', v_trades,
    'companyName', v_company.name,
    'companyEmail', coalesce(v_company.email, ''),
    'companyPhone', public.website_chat_text_phone(v_chat.company_id),
    'ownerName', case when v_assigned then v_owner.name else '' end,
    'admins', case
      when v_assigned then jsonb_build_array(jsonb_build_object('name', v_owner.name, 'email', coalesce(v_owner.email, '')))
      else coalesce((
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
    end
  );
end;
$$;

revoke all on function public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
