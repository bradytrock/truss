-- Per-user Google Calendar links, team sharing, and admin visibility.

create table public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  google_email text not null default '',
  google_calendar_id text not null default 'primary',
  linked boolean not null default false,
  linked_at timestamptz,
  share_with_team boolean not null default false,
  source text not null default 'demo' check (source in ('demo', 'google')),
  created_at timestamptz not null default now(),
  unique (company_id, staff_id)
);

create index calendar_accounts_company_idx on public.calendar_accounts (company_id);

create table public.calendar_tokens (
  account_id uuid primary key references public.calendar_accounts (id) on delete cascade,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz
);

create table public.calendar_shares (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  owner_staff_id uuid not null references public.team_members (id) on delete cascade,
  viewer_staff_id uuid not null references public.team_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_staff_id, viewer_staff_id)
);

create index calendar_shares_company_idx on public.calendar_shares (company_id);

alter table public.calendar_accounts enable row level security;
alter table public.calendar_tokens enable row level security;
alter table public.calendar_shares enable row level security;

create policy "company isolation" on public.calendar_accounts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.calendar_shares
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Tokens never leave through the Data API. Access is RPC-only.
revoke all on public.calendar_tokens from anon, authenticated, public;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.id
  from public.profiles p
  join public.team_members tm
    on tm.company_id = p.company_id
   and tm.name = p.full_name
  where p.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_staff_id() from public;
grant execute on function public.current_staff_id() to authenticated;

create or replace function public.current_is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'company_admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

revoke all on function public.current_is_company_admin() from public;
grant execute on function public.current_is_company_admin() to authenticated;

create or replace function public.can_view_staff_calendar(target_staff_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid;
  viewer_team uuid;
  owner_team uuid;
  shared_team boolean;
begin
  viewer := public.current_staff_id();
  if viewer is not null and viewer = target_staff_id then
    return true;
  end if;
  if public.current_is_company_admin() then
    return true;
  end if;
  if viewer is null then
    return false;
  end if;

  select tm.team_id into viewer_team from public.team_members tm where tm.id = viewer;
  select tm.team_id into owner_team from public.team_members tm where tm.id = target_staff_id;
  select coalesce(ca.share_with_team, false) into shared_team
    from public.calendar_accounts ca
    where ca.staff_id = target_staff_id
      and ca.company_id = public.current_company_id();

  if shared_team and viewer_team is not null and viewer_team = owner_team then
    return true;
  end if;

  return exists (
    select 1
    from public.calendar_shares s
    where s.owner_staff_id = target_staff_id
      and s.viewer_staff_id = viewer
      and s.company_id = public.current_company_id()
  );
end;
$$;

revoke all on function public.can_view_staff_calendar(uuid) from public;
grant execute on function public.can_view_staff_calendar(uuid) to authenticated;

create or replace function public.save_google_calendar_tokens(
  p_staff_id uuid,
  p_google_email text,
  p_calendar_id text,
  p_refresh_token text,
  p_access_token text,
  p_token_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account uuid;
  company uuid;
begin
  company := public.current_company_id();
  if company is null then
    raise exception 'Not signed in';
  end if;
  if public.current_staff_id() is distinct from p_staff_id and not public.current_is_company_admin() then
    raise exception 'You can only connect your own Google Calendar';
  end if;

  insert into public.calendar_accounts (
    company_id, staff_id, google_email, google_calendar_id, linked, linked_at, source
  )
  values (
    company, p_staff_id, p_google_email, coalesce(nullif(p_calendar_id, ''), 'primary'),
    true, now(), 'google'
  )
  on conflict (company_id, staff_id) do update
    set google_email = excluded.google_email,
        google_calendar_id = excluded.google_calendar_id,
        linked = true,
        linked_at = now(),
        source = 'google';

  select id into account
  from public.calendar_accounts
  where company_id = company and staff_id = p_staff_id;

  insert into public.calendar_tokens (account_id, refresh_token, access_token, token_expires_at)
  values (
    account,
    coalesce(nullif(p_refresh_token, ''), (select refresh_token from public.calendar_tokens where account_id = account)),
    p_access_token,
    p_token_expires_at
  )
  on conflict (account_id) do update
    set refresh_token = coalesce(nullif(excluded.refresh_token, ''), public.calendar_tokens.refresh_token),
        access_token = excluded.access_token,
        token_expires_at = excluded.token_expires_at;
end;
$$;

revoke all on function public.save_google_calendar_tokens(uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.save_google_calendar_tokens(uuid, text, text, text, text, timestamptz) to authenticated;

create or replace function public.google_calendar_credentials(target_staff_id uuid)
returns table (
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  google_email text,
  google_calendar_id text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_staff_calendar(target_staff_id) then
    raise exception 'Not allowed to read that calendar';
  end if;
  return query
    select
      t.refresh_token,
      t.access_token,
      t.token_expires_at,
      a.google_email,
      a.google_calendar_id
    from public.calendar_accounts a
    join public.calendar_tokens t on t.account_id = a.id
    where a.staff_id = target_staff_id
      and a.company_id = public.current_company_id()
      and a.linked = true
      and a.source = 'google';
end;
$$;

revoke all on function public.google_calendar_credentials(uuid) from public;
grant execute on function public.google_calendar_credentials(uuid) to authenticated;

create or replace function public.disconnect_google_calendar(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_staff_id() is distinct from p_staff_id and not public.current_is_company_admin() then
    raise exception 'You can only disconnect your own Google Calendar';
  end if;
  delete from public.calendar_tokens t
    using public.calendar_accounts a
    where t.account_id = a.id
      and a.staff_id = p_staff_id
      and a.company_id = public.current_company_id();
  update public.calendar_accounts
    set linked = false,
        google_email = '',
        linked_at = null,
        source = 'demo'
    where staff_id = p_staff_id
      and company_id = public.current_company_id();
end;
$$;

revoke all on function public.disconnect_google_calendar(uuid) from public;
grant execute on function public.disconnect_google_calendar(uuid) to authenticated;
