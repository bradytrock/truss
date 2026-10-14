-- Clerk can carry the existing profile id without replacing Supabase Auth yet.
-- A Clerk session token needs:
--   { "role": "authenticated", "profile_id": "<profiles.id uuid>" }
-- Supabase sessions keep working: current_profile_id() falls back to auth.uid().
-- profiles.id stays the person. clerk_user_id is filled when that person is imported.

alter table public.profiles
  add column if not exists clerk_user_id text;

create unique index if not exists profiles_clerk_user_id_key
  on public.profiles (clerk_user_id)
  where clerk_user_id is not null and clerk_user_id <> '';

create or replace function public.current_profile_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select case
    when coalesce(auth.jwt() ->> 'profile_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'profile_id')::uuid
    else auth.uid()
  end
$$;

revoke all on function public.current_profile_id() from public;
grant execute on function public.current_profile_id() to authenticated;

-- Point every public function and policy that identified the caller with auth.uid()
-- at current_profile_id(), except current_profile_id itself (it still reads auth.uid()).
do $$
declare
  fn record;
  src text;
  rewritten text;
  pol record;
  new_using text;
  new_check text;
begin
  for fn in
    select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> 'current_profile_id'
      and pg_get_functiondef(p.oid) like '%auth.uid()%'
  loop
    src := fn.def;
    rewritten := replace(src, 'auth.uid()', 'public.current_profile_id()');
    rewritten := replace(rewritten, '"auth"."uid"()', 'public.current_profile_id()');
    if rewritten <> src then
      execute rewritten;
    end if;
  end loop;

  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
  loop
    if coalesce(pol.qual, '') like '%auth.uid()%' then
      new_using := replace(pol.qual, 'auth.uid()', 'public.current_profile_id()');
      execute format(
        'alter policy %I on %I.%I using (%s)',
        pol.policyname,
        pol.schemaname,
        pol.tablename,
        new_using
      );
    end if;
    if coalesce(pol.with_check, '') like '%auth.uid()%' then
      new_check := replace(pol.with_check, 'auth.uid()', 'public.current_profile_id()');
      execute format(
        'alter policy %I on %I.%I with check (%s)',
        pol.policyname,
        pol.schemaname,
        pol.tablename,
        new_check
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
