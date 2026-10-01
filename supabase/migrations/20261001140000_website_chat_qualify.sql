-- Website chat qualifies a lead the same way New Lead does:
-- residential or commercial, trades, name, phone, email, and the full address.
-- The lead stays unassigned until an admin assigns it.

drop function if exists public.website_chat_intake(text, text, text, text);

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
  p_last text default ''
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
    null,
    null,
    20,
    'Assign this website lead.',
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
    street, city, state, postal_code, project_type, market, lead_source, tags
  ) values (
    v_chat.company_id,
    v_opp_id,
    v_lead_name,
    v_contact.id,
    'precon',
    0,
    current_date,
    '',
    v_site,
    null,
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
    'visitorEmail', v_email,
    'visitorCity', v_city,
    'visitorState', v_state,
    'visitorPostal', v_postal,
    'market', v_market,
    'trades', v_trades,
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

revoke all on function public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
