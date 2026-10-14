-- Railway only. The startup script runs this against DATABASE_URL when that host
-- is Railway. Do not paste it into the hosted Supabase project: replacing
-- auth.uid() there would break login.

grant usage on schema auth, public, storage, extensions to anon, authenticated, service_role;

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = public, auth
as $$
  select case
    when coalesce(current_setting('request.jwt.claim.sub', true), '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then current_setting('request.jwt.claim.sub', true)::uuid
    when coalesce(current_setting('request.jwt.claims', true), '') ~ '^\{'
      and coalesce(current_setting('request.jwt.claims', true)::json->>'sub', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    else null
  end
$$;

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
