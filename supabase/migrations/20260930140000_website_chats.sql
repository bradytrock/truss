-- Website chat box. Visitors on a computer talk here; the thread shows in Inbox.
-- A phone opens Messages to the company main number instead. That number is companies.phone.

create table if not exists public.website_chats (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  visitor_token text not null unique,
  visitor_label text not null default 'Website visitor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_chats_company_updated_idx
  on public.website_chats (company_id, updated_at desc);

create table if not exists public.website_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.website_chats (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists website_chat_messages_chat_idx
  on public.website_chat_messages (chat_id, created_at);

alter table public.website_chats enable row level security;
alter table public.website_chat_messages enable row level security;
revoke all on public.website_chats from public, anon, authenticated;
revoke all on public.website_chat_messages from public, anon, authenticated;

create or replace function public.website_chat_member_company()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  select p.company_id into v_company from public.profiles p where p.id = auth.uid();
  return v_company;
end;
$$;

revoke all on function public.website_chat_member_company() from public, anon, authenticated;

create or replace function public.website_chat_lookup(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
begin
  select * into v_company
  from public.companies
  where lower(slug) = lower(trim(coalesce(p_slug, '')))
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That office was not found.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'companyName', v_company.name,
    'phone', coalesce(v_company.phone, '')
  );
end;
$$;

create or replace function public.website_chat_start(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_token text;
  v_id uuid;
begin
  select * into v_company
  from public.companies
  where lower(slug) = lower(trim(coalesce(p_slug, '')))
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That office was not found.');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.website_chats (company_id, visitor_token)
  values (v_company.id, v_token)
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

create or replace function public.website_chat_post(p_token text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat public.website_chats%rowtype;
  v_body text;
  v_count integer;
  v_id uuid;
  v_at timestamptz;
begin
  v_body := trim(coalesce(p_body, ''));
  if v_body = '' then
    return jsonb_build_object('ok', false, 'error', 'Write a message first.');
  end if;
  if char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'That message is too long.');
  end if;

  select * into v_chat from public.website_chats where visitor_token = trim(coalesce(p_token, ''));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Start the chat again.');
  end if;

  select count(*) into v_count from public.website_chat_messages where chat_id = v_chat.id;
  if v_count >= 200 then
    return jsonb_build_object('ok', false, 'error', 'This chat is full. Start a new one.');
  end if;

  insert into public.website_chat_messages (chat_id, company_id, direction, body)
  values (v_chat.id, v_chat.company_id, 'inbound', v_body)
  returning id, created_at into v_id, v_at;

  update public.website_chats set updated_at = v_at where id = v_chat.id;

  return jsonb_build_object(
    'ok', true,
    'message', jsonb_build_object('id', v_id, 'direction', 'inbound', 'body', v_body, 'createdAt', v_at)
  );
end;
$$;

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

create or replace function public.website_chat_office_reply(p_chat_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_chat public.website_chats%rowtype;
  v_body text;
  v_id uuid;
  v_at timestamptz;
begin
  v_company := public.website_chat_member_company();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to reply.');
  end if;

  v_body := trim(coalesce(p_body, ''));
  if v_body = '' then
    return jsonb_build_object('ok', false, 'error', 'Write a reply first.');
  end if;
  if char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'That reply is too long.');
  end if;

  select * into v_chat from public.website_chats where id = p_chat_id and company_id = v_company;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That chat is not in this office.');
  end if;

  insert into public.website_chat_messages (chat_id, company_id, direction, body)
  values (v_chat.id, v_chat.company_id, 'outbound', v_body)
  returning id, created_at into v_id, v_at;

  update public.website_chats set updated_at = v_at where id = v_chat.id;

  return jsonb_build_object(
    'ok', true,
    'message', jsonb_build_object('id', v_id, 'direction', 'outbound', 'body', v_body, 'createdAt', v_at)
  );
end;
$$;

revoke all on function public.website_chat_lookup(text) from public;
revoke all on function public.website_chat_start(text) from public;
revoke all on function public.website_chat_post(text, text) from public;
revoke all on function public.website_chat_read(text) from public;
revoke all on function public.website_chat_office_list() from public;
revoke all on function public.website_chat_office_reply(uuid, text) from public;

grant execute on function public.website_chat_lookup(text) to anon, authenticated;
grant execute on function public.website_chat_start(text) to anon, authenticated;
grant execute on function public.website_chat_post(text, text) to anon, authenticated;
grant execute on function public.website_chat_read(text) to anon, authenticated;
grant execute on function public.website_chat_office_list() to authenticated;
grant execute on function public.website_chat_office_reply(uuid, text) to authenticated;

notify pgrst, 'reload schema';
