-- Per-office Photon Spectrum project. Run this file in the Supabase SQL editor.
-- It is SQL. A chat transcript that starts with "New Chat" is not, and Postgres
-- rejects it with 42601 (syntax error at or near "New").
-- Safe to re-run.

create table if not exists public.photon_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  project_id text not null default '',
  project_secret text not null default '',
  project_name text not null default '',
  secret_hint text not null default '',
  linked boolean not null default false,
  linked_at timestamptz,
  linked_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photon_connections add column if not exists project_id text;
alter table public.photon_connections add column if not exists project_secret text;
alter table public.photon_connections add column if not exists project_name text;
alter table public.photon_connections add column if not exists secret_hint text;
alter table public.photon_connections add column if not exists linked boolean;
alter table public.photon_connections add column if not exists linked_at timestamptz;
alter table public.photon_connections add column if not exists linked_by text;
alter table public.photon_connections add column if not exists created_at timestamptz;
alter table public.photon_connections add column if not exists updated_at timestamptz;

update public.photon_connections set project_id = coalesce(project_id, '') where project_id is null;
update public.photon_connections set project_secret = coalesce(project_secret, '') where project_secret is null;
update public.photon_connections set project_name = coalesce(project_name, '') where project_name is null;
update public.photon_connections set secret_hint = coalesce(secret_hint, '') where secret_hint is null;
update public.photon_connections set linked = coalesce(linked, false) where linked is null;
update public.photon_connections set linked_by = coalesce(linked_by, '') where linked_by is null;
update public.photon_connections set created_at = coalesce(created_at, now()) where created_at is null;
update public.photon_connections set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.photon_connections alter column project_id set default '';
alter table public.photon_connections alter column project_id set not null;
alter table public.photon_connections alter column project_secret set default '';
alter table public.photon_connections alter column project_secret set not null;
alter table public.photon_connections alter column project_name set default '';
alter table public.photon_connections alter column project_name set not null;
alter table public.photon_connections alter column secret_hint set default '';
alter table public.photon_connections alter column secret_hint set not null;
alter table public.photon_connections alter column linked set default false;
alter table public.photon_connections alter column linked set not null;
alter table public.photon_connections alter column linked_by set default '';
alter table public.photon_connections alter column linked_by set not null;
alter table public.photon_connections alter column created_at set default now();
alter table public.photon_connections alter column created_at set not null;
alter table public.photon_connections alter column updated_at set default now();
alter table public.photon_connections alter column updated_at set not null;

alter table public.photon_connections enable row level security;

revoke all on table public.photon_connections from public, anon, authenticated;

create or replace function public.photon_admin_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.company_id
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.role = 'company_admin'
  limit 1;
$$;

create or replace function public.photon_company_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_name text;
  conn public.photon_connections%rowtype;
  v_found boolean := false;
begin
  v_company := public.photon_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can view Photon settings.');
  end if;
  select companies.name into v_name from public.companies where id = v_company;
  select * into conn from public.photon_connections where company_id = v_company;
  v_found := found;
  return jsonb_build_object(
    'ok', true,
    'linked', case when v_found then conn.linked and conn.project_id <> '' and conn.project_secret <> '' else false end,
    'companyName', coalesce(v_name, ''),
    'projectId', case when v_found then conn.project_id else '' end,
    'projectName', case when v_found then conn.project_name else '' end,
    'secretHint', case when v_found then conn.secret_hint else '' end,
    'linkedAt', case when v_found then conn.linked_at else null end
  );
end;
$$;

create or replace function public.photon_company_save(
  p_project_id text,
  p_project_secret text,
  p_project_name text,
  p_secret_hint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_name text;
  existing public.photon_connections%rowtype;
  v_found boolean := false;
  v_project_id text;
  v_secret text;
  v_hint text;
  v_project_name text;
  v_linked_at timestamptz;
begin
  v_company := public.photon_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can connect Photon.');
  end if;

  v_project_id := trim(coalesce(p_project_id, ''));
  if v_project_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'Paste the Photon project id from that project''s settings.');
  end if;

  select * into existing from public.photon_connections where company_id = v_company;
  v_found := found;
  v_secret := trim(coalesce(p_project_secret, ''));
  if v_secret = '' then
    if v_found
      and existing.project_id = v_project_id
      and existing.project_secret <> '' then
      v_secret := existing.project_secret;
    else
      return jsonb_build_object('ok', false, 'error', 'Paste the Photon project secret from that project''s settings.');
    end if;
  end if;

  v_hint := trim(coalesce(p_secret_hint, ''));
  if v_hint = '' and v_found and trim(coalesce(p_project_secret, '')) = '' and existing.secret_hint <> '' then
    v_hint := existing.secret_hint;
  elsif v_hint = '' then
    v_hint := right(v_secret, 4);
  end if;
  v_project_name := trim(coalesce(p_project_name, ''));
  if v_project_name = '' and v_found and existing.project_id = v_project_id and existing.project_name <> '' then
    v_project_name := existing.project_name;
  end if;
  v_linked_at := case when v_found then coalesce(existing.linked_at, now()) else now() end;
  select companies.name into v_name from public.companies where id = v_company;

  insert into public.photon_connections (
    company_id, project_id, project_secret, project_name, secret_hint,
    linked, linked_at, linked_by, updated_at
  ) values (
    v_company, v_project_id, v_secret, v_project_name, v_hint,
    true, v_linked_at, '', now()
  )
  on conflict (company_id) do update
  set
    project_id = excluded.project_id,
    project_secret = excluded.project_secret,
    project_name = excluded.project_name,
    secret_hint = excluded.secret_hint,
    linked = true,
    linked_at = coalesce(public.photon_connections.linked_at, now()),
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'linked', true,
    'companyName', coalesce(v_name, ''),
    'projectId', v_project_id,
    'projectName', v_project_name,
    'secretHint', v_hint
  );
end;
$$;

create or replace function public.photon_company_disconnect()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_name text;
begin
  v_company := public.photon_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can disconnect Photon.');
  end if;
  select companies.name into v_name from public.companies where id = v_company;
  insert into public.photon_connections (
    company_id, project_id, project_secret, project_name, secret_hint, linked, linked_at, linked_by, updated_at
  ) values (
    v_company, '', '', '', '', false, null, '', now()
  )
  on conflict (company_id) do update
  set
    project_id = '',
    project_secret = '',
    project_name = '',
    secret_hint = '',
    linked = false,
    linked_at = null,
    linked_by = '',
    updated_at = now();
  return jsonb_build_object('ok', true, 'linked', false, 'companyName', coalesce(v_name, ''));
end;
$$;

-- Signed-in teammate's office. The secret stays on the server send path.
create or replace function public.photon_outbound_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  conn public.photon_connections%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', true, 'configured', false, 'missing', true);
  end if;
  select profile.company_id into v_company
  from public.profiles profile
  where profile.id = auth.uid()
  limit 1;
  if v_company is null then
    return jsonb_build_object('ok', false, 'configured', false, 'error', 'Missing company.');
  end if;
  select * into conn
  from public.photon_connections
  where company_id = v_company
    and linked
    and project_id <> ''
    and project_secret <> '';
  if not found then
    return jsonb_build_object('ok', true, 'configured', false, 'missing', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'configured', true,
    'projectId', conn.project_id,
    'projectSecret', conn.project_secret,
    'projectName', coalesce(conn.project_name, '')
  );
end;
$$;

create or replace function public.photon_outbound_for_voice(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  conn public.photon_connections%rowtype;
begin
  select agent.company_id into v_company
  from public.voice_agents agent
  where agent.webhook_token = trim(coalesce(p_token, ''))
    and agent.enabled
  limit 1;
  if v_company is null then
    return jsonb_build_object('ok', false, 'configured', false, 'error', 'Unknown voice agent.');
  end if;
  select * into conn
  from public.photon_connections
  where company_id = v_company
    and linked
    and project_id <> ''
    and project_secret <> '';
  if not found then
    return jsonb_build_object('ok', true, 'configured', false, 'missing', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'configured', true,
    'projectId', conn.project_id,
    'projectSecret', conn.project_secret,
    'projectName', coalesce(conn.project_name, '')
  );
end;
$$;

revoke all on function public.photon_admin_company_id() from public;
revoke all on function public.photon_company_status() from public;
revoke all on function public.photon_company_save(text, text, text, text) from public;
revoke all on function public.photon_company_disconnect() from public;
revoke all on function public.photon_outbound_config() from public;
revoke all on function public.photon_outbound_for_voice(text) from public;

grant execute on function public.photon_company_status() to authenticated;
grant execute on function public.photon_company_save(text, text, text, text) to authenticated;
grant execute on function public.photon_company_disconnect() to authenticated;
grant execute on function public.photon_outbound_config() to authenticated;
grant execute on function public.photon_outbound_for_voice(text) to anon, authenticated;

notify pgrst, 'reload schema';
