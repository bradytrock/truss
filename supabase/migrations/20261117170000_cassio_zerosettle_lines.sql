-- Personal ZeroSettle line for the hosted Cassio assistant.
-- One row per seat. The office client-text connection is a different table and is not used here.
-- crm_updates and group_messages stay off until a later mode lets the agent write the book or join groups.

create table if not exists public.cassio_lines (
  staff_id uuid primary key references public.team_members (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  line_id text not null default '',
  line_number text not null default '',
  group_id text not null default '',
  your_number text not null default '',
  active boolean not null default false,
  managed_by text not null default 'zerosettle',
  profile_name text not null default '',
  token_hint text not null default '',
  credits_left integer,
  crm_updates boolean not null default false,
  group_messages boolean not null default false,
  linked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists cassio_lines_company_idx on public.cassio_lines (company_id);

create table if not exists public.cassio_line_secrets (
  staff_id uuid primary key references public.cassio_lines (staff_id) on delete cascade,
  api_token text not null default ''
);

alter table public.cassio_lines enable row level security;
alter table public.cassio_line_secrets enable row level security;

revoke all on public.cassio_lines from anon, authenticated, public;
revoke all on public.cassio_line_secrets from anon, authenticated, public;

create or replace function public.cassio_line_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_line public.cassio_lines%rowtype;
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  select * into v_line from public.cassio_lines where staff_id = v_staff;
  if not found then
    return jsonb_build_object('ok', true, 'linked', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'linked', true,
    'lineId', v_line.line_id,
    'lineNumber', v_line.line_number,
    'groupId', v_line.group_id,
    'yourNumber', v_line.your_number,
    'active', v_line.active,
    'managedBy', v_line.managed_by,
    'profileName', v_line.profile_name,
    'tokenHint', v_line.token_hint,
    'creditsLeft', v_line.credits_left,
    'crmUpdates', v_line.crm_updates,
    'groupMessages', v_line.group_messages,
    'linkedAt', v_line.linked_at
  );
end;
$$;

create or replace function public.cassio_line_save(
  p_line_id text,
  p_line_number text,
  p_group_id text,
  p_your_number text,
  p_active boolean,
  p_managed_by text,
  p_profile_name text,
  p_token_hint text,
  p_credits_left integer,
  p_api_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_company uuid := public.current_company_id();
  v_token text := trim(coalesce(p_api_token, ''));
  v_number text := trim(coalesce(p_line_number, ''));
begin
  if v_staff is null or v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  if coalesce(p_managed_by, '') <> 'zerosettle' then
    return jsonb_build_object('ok', false, 'error', 'This connection is the hosted ZeroSettle assistant.');
  end if;
  if v_number = '' then
    return jsonb_build_object('ok', false, 'error', 'ZeroSettle did not return a number for this line.');
  end if;
  if not exists (
    select 1 from public.team_members tm
    where tm.id = v_staff and tm.company_id = v_company
  ) then
    return jsonb_build_object('ok', false, 'error', 'Your seat is not on this company.');
  end if;

  if v_token = '' then
    select secrets.api_token into v_token
    from public.cassio_line_secrets secrets
    where secrets.staff_id = v_staff;
  end if;
  if coalesce(v_token, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Paste a ZeroSettle API token.');
  end if;

  insert into public.cassio_lines (
    staff_id, company_id, line_id, line_number, group_id, your_number,
    active, managed_by, profile_name, token_hint, credits_left, linked_at, updated_at
  )
  values (
    v_staff, v_company, trim(coalesce(p_line_id, '')), v_number, trim(coalesce(p_group_id, '')),
    trim(coalesce(p_your_number, '')), coalesce(p_active, false), 'zerosettle',
    trim(coalesce(p_profile_name, '')), trim(coalesce(p_token_hint, '')),
    case when p_credits_left is null or p_credits_left < 0 then null else p_credits_left end,
    now(), now()
  )
  on conflict (staff_id) do update
    set line_id = excluded.line_id,
        line_number = excluded.line_number,
        group_id = excluded.group_id,
        your_number = excluded.your_number,
        active = excluded.active,
        managed_by = 'zerosettle',
        profile_name = excluded.profile_name,
        token_hint = excluded.token_hint,
        credits_left = excluded.credits_left,
        linked_at = coalesce(public.cassio_lines.linked_at, now()),
        updated_at = now();

  insert into public.cassio_line_secrets (staff_id, api_token)
  values (v_staff, v_token)
  on conflict (staff_id) do update
    set api_token = excluded.api_token;

  return public.cassio_line_status();
end;
$$;

create or replace function public.cassio_line_disconnect()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in on a seat to connect Cassio.');
  end if;
  delete from public.cassio_lines where staff_id = v_staff;
  return jsonb_build_object('ok', true, 'linked', false);
end;
$$;

create or replace function public.cassio_line_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select secrets.api_token
      from public.cassio_line_secrets secrets
      where secrets.staff_id = public.current_staff_id()
    ),
    ''
  );
$$;

revoke all on function public.cassio_line_status() from public;
revoke all on function public.cassio_line_save(text, text, text, text, boolean, text, text, text, integer, text) from public;
revoke all on function public.cassio_line_disconnect() from public;
revoke all on function public.cassio_line_secret() from public;

grant execute on function public.cassio_line_status() to authenticated;
grant execute on function public.cassio_line_save(text, text, text, text, boolean, text, text, text, integer, text) to authenticated;
grant execute on function public.cassio_line_disconnect() to authenticated;
grant execute on function public.cassio_line_secret() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.cassio_line_status() to service_role;
    grant execute on function public.cassio_line_save(text, text, text, text, boolean, text, text, text, integer, text) to service_role;
    grant execute on function public.cassio_line_disconnect() to service_role;
    grant execute on function public.cassio_line_secret() to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
