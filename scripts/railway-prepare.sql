-- Railway only. The startup script runs this against DATABASE_URL when that host
-- is Railway. Do not paste it into the hosted Supabase project: replacing
-- auth.uid() there would break login.

create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select case
    when coalesce(current_setting('request.jwt.claims', true), '') ~ '^\{'
      then current_setting('request.jwt.claims', true)::jsonb
    else '{}'::jsonb
  end
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  )
$$;

grant usage on schema auth, public, storage, extensions to anon, authenticated, service_role;

create or replace function public.reject_superuser_api()
returns void
language plpgsql
as $$
begin
  if current_user = 'postgres' then
    raise exception 'The API cannot run as the database owner.'
      using errcode = '42501';
  end if;
end
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant all on all sequences in schema storage to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- Clerk sessions are not uuids. profile_id on the token wins; otherwise match clerk_user_id.
alter table public.profiles
  add column if not exists clerk_user_id text;

create unique index if not exists profiles_clerk_user_id_key
  on public.profiles (clerk_user_id)
  where clerk_user_id is not null and clerk_user_id <> '';

create or replace function public.profile_id_for_clerk(clerk_sub text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where clerk_sub is not null
    and clerk_sub <> ''
    and clerk_user_id = clerk_sub
  limit 1
$$;

revoke all on function public.profile_id_for_clerk(text) from public;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case
      when coalesce(auth.jwt() ->> 'profile_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (auth.jwt() ->> 'profile_id')::uuid
    end,
    case
      when coalesce(auth.jwt() ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (auth.jwt() ->> 'sub')::uuid
    end,
    public.profile_id_for_clerk(auth.jwt() ->> 'sub')
  )
$$;

revoke all on function public.current_profile_id() from public;
grant execute on function public.current_profile_id() to anon, authenticated;

-- Policies still call auth.uid(). Clerk subjects are not uuids, so this
-- follows current_profile_id() instead of reading the subject as a uuid.
create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = public
as $$
  select public.current_profile_id()
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- A missing profile is not an unpaid company. Only a found company with
-- subscription_active = false is sent to the marketing site.
create or replace function public.company_subscription_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.subscription_active
      from public.profiles p
      join public.companies c on c.id = p.company_id
      where p.id = public.current_profile_id()
      limit 1
    ),
    true
  );
$$;

grant execute on function public.company_subscription_active() to anon, authenticated;
