-- A Clerk user id is not a uuid, so current_profile_id() cannot fall through to auth.uid().
-- profile_id on the session token still wins. Otherwise match profiles.clerk_user_id.

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
grant execute on function public.current_profile_id() to authenticated;

notify pgrst, 'reload schema';
