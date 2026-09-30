-- Visitor tokens use pgcrypto in the extensions schema. search_path is public only.

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

revoke all on function public.website_chat_start(text) from public;
grant execute on function public.website_chat_start(text) to anon, authenticated;
