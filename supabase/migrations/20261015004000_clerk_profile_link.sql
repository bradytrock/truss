-- Link a Clerk session to the existing profile, and don't treat an
-- unresolved sign-in as an unpaid company.

create or replace function public.link_clerk_profile(p_clerk_sub text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    return null;
  end if;
  if coalesce(p_clerk_sub, '') = '' or coalesce(p_email, '') = '' then
    return null;
  end if;
  update public.profiles as profile
     set clerk_user_id = p_clerk_sub
    from auth.users as account
   where account.id = profile.id
     and lower(account.email) = lower(p_email)
     and (profile.clerk_user_id is null or profile.clerk_user_id = p_clerk_sub)
  returning profile.id into found;
  return found;
end;
$$;

revoke all on function public.link_clerk_profile(text, text) from public;
grant execute on function public.link_clerk_profile(text, text) to service_role;

create or replace function public.link_clerk_session()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clerk_sub text := nullif(auth.jwt() ->> 'sub', '');
  email text := lower(nullif(coalesce(auth.jwt() ->> 'email', auth.jwt() ->> 'email_address'), ''));
  found uuid;
begin
  if clerk_sub is null then
    return null;
  end if;
  if email is not null then
    update public.profiles as profile
       set clerk_user_id = clerk_sub
      from auth.users as account
     where account.id = profile.id
       and lower(account.email) = email
       and (profile.clerk_user_id is null or profile.clerk_user_id = clerk_sub)
    returning profile.id into found;
  end if;
  return coalesce(found, public.profile_id_for_clerk(clerk_sub));
end;
$$;

revoke all on function public.link_clerk_session() from public;
grant execute on function public.link_clerk_session() to anon, authenticated;

create or replace function public.company_subscription_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select company.subscription_active
      from public.profiles as profile
      join public.companies as company on company.id = profile.company_id
      where profile.id = public.current_profile_id()
      limit 1
    ),
    true
  );
$$;

grant execute on function public.company_subscription_active() to anon, authenticated;
grant execute on function public.current_profile_id() to anon, authenticated;

notify pgrst, 'reload schema';
