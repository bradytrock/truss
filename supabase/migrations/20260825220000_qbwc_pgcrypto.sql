-- pgcrypto's crypt/gen_salt live in the extensions schema on hosted Supabase.
-- qbwc_upsert_connector used search_path = public only, so gen_salt(unknown)
-- did not exist when creating a Web Connector password.

create extension if not exists pgcrypto;

create or replace function public.qbwc_upsert_connector(p_password text, p_item_name text default 'Contract work')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company uuid;
  v_row public.qbwc_connectors%rowtype;
  v_item text;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'Not signed in';
  end if;
  v_item := coalesce(nullif(trim(p_item_name), ''), 'Contract work');
  select * into v_row from public.qbwc_connectors where company_id = v_company;
  if not found then
    if coalesce(p_password, '') = '' then
      raise exception 'Set a Web Connector password';
    end if;
    insert into public.qbwc_connectors (company_id, username, password_hash, default_item_name)
    values (
      v_company,
      'truss_' || substr(replace(v_company::text, '-', ''), 1, 12),
      crypt(p_password, gen_salt('bf'::text)),
      v_item
    )
    returning * into v_row;
  else
    update public.qbwc_connectors
    set
      password_hash = case
        when coalesce(p_password, '') = '' then password_hash
        else crypt(p_password, gen_salt('bf'::text))
      end,
      default_item_name = v_item,
      enabled = true,
      updated_at = now()
    where company_id = v_company
    returning * into v_row;
  end if;
  return jsonb_build_object(
    'username', v_row.username,
    'ownerId', v_row.owner_id,
    'fileId', v_row.file_id,
    'itemName', v_row.default_item_name,
    'enabled', v_row.enabled,
    'lastConnectedAt', v_row.last_connected_at,
    'lastError', v_row.last_error
  );
end;
$$;

create or replace function public.qbwc_authenticate(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.qbwc_connectors%rowtype;
  v_ticket uuid;
begin
  if coalesce(p_username, '') = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  select * into v_row
  from public.qbwc_connectors
  where username = trim(p_username)
    and enabled
    and password_hash = crypt(p_password, password_hash)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  delete from public.qbwc_sessions where company_id = v_row.company_id;
  insert into public.qbwc_sessions (company_id)
  values (v_row.company_id)
  returning ticket into v_ticket;
  update public.qbwc_connectors
  set last_connected_at = now(), last_error = '', updated_at = now()
  where company_id = v_row.company_id;
  return jsonb_build_object('ok', true, 'ticket', v_ticket, 'companyId', v_row.company_id);
end;
$$;

revoke all on function public.qbwc_upsert_connector(text, text) from public;
grant execute on function public.qbwc_upsert_connector(text, text) to authenticated;

revoke all on function public.qbwc_authenticate(text, text) from public;
grant execute on function public.qbwc_authenticate(text, text) to anon, authenticated;
