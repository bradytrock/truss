-- Invited seats sign in with Clerk. A profile no longer has to be an auth.users row.

do $$
declare
  constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'profiles'
    and c.contype = 'f'
    and pg_get_constraintdef(c.oid) ilike '%auth.users%';
  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

create or replace function public.claim_clerk_invite(
  p_token text,
  p_clerk_sub text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clerk_sub text := nullif(trim(coalesce(p_clerk_sub, '')), '');
  caller_super boolean := false;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_used timestamptz;
  invite_role public.seat_role;
  seat_title text;
  seat_name text;
  v_full_name text;
  v_initials text;
  profile_id uuid;
  existing_clerk text;
begin
  select rolsuper into caller_super
  from pg_roles
  where rolname = session_user;
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and coalesce(caller_super, false) = false then
    raise exception 'Not allowed.';
  end if;
  if clerk_sub is null then
    raise exception 'Missing Clerk user.';
  end if;

  select i.company_id, i.staff_id, i.email, i.used_at, tm.role, tm.title, tm.name
    into invite_company, invite_staff, invite_email, invite_used, invite_role, seat_title, seat_name
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  where i.token = trim(coalesce(p_token, ''))
    and i.declined_at is null
    and i.accepted_at is not null
    and i.expires_at > now()
    and coalesce(tm.locked, false) = false
  for update of i;

  if invite_company is null or invite_role is null then
    raise exception 'That invite is missing, already used, or expired.';
  end if;

  v_full_name := coalesce(
    nullif(trim(coalesce(p_full_name, '')), ''),
    nullif(trim(coalesce(seat_name, '')), ''),
    split_part(coalesce(invite_email, ''), '@', 1),
    'Teammate'
  );
  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');

  select id into profile_id
  from public.profiles
  where clerk_user_id = clerk_sub
  limit 1;

  if profile_id is null then
    select id, clerk_user_id into profile_id, existing_clerk
    from public.profiles
    where staff_id = invite_staff
      and company_id = invite_company
    limit 1;
    if existing_clerk is not null and existing_clerk <> clerk_sub then
      raise exception 'That seat already has a login.';
    end if;
  end if;

  if profile_id is null then
    if invite_used is not null then
      raise exception 'That invite is missing, already used, or expired.';
    end if;
    profile_id := gen_random_uuid();
    insert into public.profiles (
      id, company_id, full_name, title, initials, role, staff_id, onboarding_step, clerk_user_id
    )
    values (
      profile_id,
      invite_company,
      v_full_name,
      coalesce(nullif(trim(coalesce(seat_title, '')), ''), 'Team member'),
      v_initials,
      invite_role,
      invite_staff,
      'profile',
      clerk_sub
    );
  else
    update public.profiles
    set company_id = invite_company,
        full_name = v_full_name,
        title = coalesce(nullif(trim(coalesce(seat_title, '')), ''), title),
        initials = v_initials,
        role = invite_role,
        staff_id = invite_staff,
        onboarding_step = coalesce(onboarding_step, 'profile'),
        clerk_user_id = clerk_sub
    where id = profile_id
      and (clerk_user_id is null or clerk_user_id = clerk_sub);
    if not found then
      raise exception 'That seat already has a login.';
    end if;
  end if;

  update public.team_members
  set
    name = v_full_name,
    title = coalesce(nullif(trim(coalesce(seat_title, '')), ''), title),
    initials = v_initials,
    email = coalesce(nullif(trim(coalesce(invite_email, '')), ''), email),
    invite_expires_at = null,
    locked = false
  where id = invite_staff;

  update public.account_invites
  set used_at = coalesce(used_at, now())
  where token = trim(coalesce(p_token, ''))
    and used_at is null;

  return profile_id;
end;
$$;

alter function public.claim_clerk_invite(text, text, text) owner to postgres;
alter function public.claim_clerk_invite(text, text, text) reset row_security;

revoke all on function public.claim_clerk_invite(text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_clerk_invite(text, text, text) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
