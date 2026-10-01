-- A personal website chat stays in that person's inbox.
-- The office chat, with no person, stays visible to the company.
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
          and (c.owner_staff_id is null or c.owner_staff_id = v_staff)
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
  v_staff uuid;
  v_chat public.website_chats%rowtype;
  v_body text;
  v_id uuid;
  v_at timestamptz;
begin
  v_company := public.website_chat_member_company();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to reply.');
  end if;
  v_staff := public.current_staff_id();

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
  if v_chat.owner_staff_id is not null and v_chat.owner_staff_id is distinct from v_staff then
    return jsonb_build_object('ok', false, 'error', 'That chat belongs to someone else.');
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

revoke all on function public.website_chat_office_list() from public;
revoke all on function public.website_chat_office_reply(uuid, text) from public;
grant execute on function public.website_chat_office_list() to authenticated;
grant execute on function public.website_chat_office_reply(uuid, text) to authenticated;

notify pgrst, 'reload schema';
