-- A person's website chat assigns the lead to that seat.
-- The office chat, with no person, stays unassigned.
-- Safe to re-run.

alter table public.website_chats add column if not exists owner_staff_id uuid;
alter table public.website_chats drop constraint if exists website_chats_owner_staff_id_fkey;
alter table public.website_chats
  add constraint website_chats_owner_staff_id_fkey
  foreign key (owner_staff_id) references public.team_members (id) on delete set null;

drop function if exists public.website_chat_start(text);

create or replace function public.website_chat_start(p_slug text, p_owner text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_token text;
  v_id uuid;
  v_owner uuid;
  v_owner_raw text;
begin
  select * into v_company
  from public.companies
  where lower(slug) = lower(trim(coalesce(p_slug, '')))
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That office was not found.');
  end if;

  v_owner_raw := trim(coalesce(p_owner, ''));
  if v_owner_raw <> '' then
    if v_owner_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error', 'That person is not on this office.');
    end if;
    select m.id into v_owner
    from public.team_members m
    where m.id = v_owner_raw::uuid
      and m.company_id = v_company.id
      and not m.locked;
    if v_owner is null then
      return jsonb_build_object('ok', false, 'error', 'That person is not on this office.');
    end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.website_chats (company_id, visitor_token, owner_staff_id)
  values (v_company.id, v_token, v_owner)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'chatId', v_id,
    'companyName', v_company.name,
    'phone', coalesce(v_company.phone, '')
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
  v_owner public.team_members%rowtype;
  v_assigned boolean := false;
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
      v_chat.company_id, v_name, 'Homeowner', '', v_phone, false
    )
    returning * into v_contact;
    v_created_contact := true;
  end if;

  v_state := coalesce(nullif(trim(v_company.state), ''), 'TX');
  v_code := public.voice_next_job_code(v_chat.company_id, 'Website Chat');
  v_lead_name := v_name || ' — ' || v_street;
  v_note := 'Started in the website chat. ' || v_name || ', ' || v_phone || ', ' || v_street || '.';
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
    v_street,
    'roofing',
    'residential',
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
    case when v_assigned then v_owner.name else '' end,
    v_street,
    case when v_assigned then v_owner.id else null end,
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
      v_name || ' · ' || v_phone || ' · ' || v_street || '. This lead is in your pipeline.'
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
  end if;

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


revoke all on function public.website_chat_start(text, text) from public;
grant execute on function public.website_chat_start(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
