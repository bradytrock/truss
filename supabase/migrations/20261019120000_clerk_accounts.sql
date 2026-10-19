-- Clerk is the login. profiles.id no longer has to be a Supabase Auth user.
-- New accounts are inserted here and linked with profiles.clerk_user_id.

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_class f on f.oid = c.confrelid
    join pg_namespace fn on fn.oid = f.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'f'
      and fn.nspname = 'auth'
      and f.relname = 'users'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
  end loop;
end $$;

-- Email link can use the seat email when there is no auth.users row.
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

  if found is null then
    update public.profiles as profile
       set clerk_user_id = p_clerk_sub
      from public.team_members as seat
     where seat.id = profile.staff_id
       and lower(seat.email) = lower(p_email)
       and (profile.clerk_user_id is null or profile.clerk_user_id = p_clerk_sub)
       and profile.id = (
         select candidate.id
         from public.profiles as candidate
         join public.team_members as member on member.id = candidate.staff_id
         where lower(member.email) = lower(p_email)
           and (candidate.clerk_user_id is null or candidate.clerk_user_id = p_clerk_sub)
         order by case when candidate.clerk_user_id = p_clerk_sub then 0 else 1 end, candidate.created_at
         limit 1
       )
    returning profile.id into found;
  end if;

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

    if found is null then
      update public.profiles as profile
         set clerk_user_id = clerk_sub
        from public.team_members as seat
       where seat.id = profile.staff_id
         and lower(seat.email) = email
         and (profile.clerk_user_id is null or profile.clerk_user_id = clerk_sub)
         and profile.id = (
           select candidate.id
           from public.profiles as candidate
           join public.team_members as member on member.id = candidate.staff_id
           where lower(member.email) = email
             and (candidate.clerk_user_id is null or candidate.clerk_user_id = clerk_sub)
           order by case when candidate.clerk_user_id = clerk_sub then 0 else 1 end, candidate.created_at
           limit 1
         )
      returning profile.id into found;
    end if;
  end if;
  return coalesce(found, public.profile_id_for_clerk(clerk_sub));
end;
$$;

revoke all on function public.link_clerk_session() from public;
grant execute on function public.link_clerk_session() to anon, authenticated;

-- Create the company or join the invite, and store the Clerk user id on the profile.
create or replace function public.provision_clerk_user(
  p_id uuid,
  p_clerk_sub text,
  p_email text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  new_company_id uuid;
  new_staff_id uuid;
  v_full_name text;
  v_title text;
  v_company_name text;
  v_initials text;
  invite_token text;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
  existing_id uuid;
begin
  begin
    perform set_config('row_security', 'off', true);
  exception
    when others then null;
  end;

  if coalesce(p_clerk_sub, '') = '' then
    raise exception 'Clerk user id is required.';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Email is required.';
  end if;

  select id into existing_id
  from public.profiles
  where clerk_user_id = p_clerk_sub
  limit 1;
  if existing_id is not null then
    p_id := existing_id;
  end if;

  v_full_name := coalesce(
    nullif(trim(coalesce(p_meta->>'full_name', '')), ''),
    split_part(coalesce(p_email, ''), '@', 1),
    'Owner'
  );
  v_title := coalesce(nullif(trim(coalesce(p_meta->>'title', '')), ''), 'Company admin');
  v_company_name := coalesce(nullif(trim(coalesce(p_meta->>'company', '')), ''), 'Truss');
  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');
  invite_token := nullif(trim(coalesce(
    p_meta->>'invite_token',
    p_meta->>'inviteToken',
    ''
  )), '');

  if invite_token is not null then
    select i.company_id, i.staff_id, i.email, tm.role
      into invite_company, invite_staff, invite_email, invite_role
    from public.account_invites i
    join public.team_members tm on tm.id = i.staff_id
    where i.token = invite_token
      and i.used_at is null
      and i.declined_at is null
      and i.expires_at > now()
      and coalesce(tm.locked, false) = false;

    if invite_company is null then
      if existing_id is not null then
        return;
      end if;
      raise exception 'That invite is missing, already used, or expired.';
    end if;

    if nullif(trim(coalesce(invite_email, '')), '') is not null
       and lower(trim(invite_email)) is distinct from lower(trim(p_email)) then
      raise exception 'Sign up with the email this invite was sent to.';
    end if;

    insert into public.profiles (
      id, company_id, full_name, title, initials, role, staff_id, onboarding_step, clerk_user_id
    )
    values (
      p_id,
      invite_company,
      v_full_name,
      v_title,
      v_initials,
      invite_role,
      invite_staff,
      'profile',
      p_clerk_sub
    )
    on conflict (id) do update
      set company_id = excluded.company_id,
          full_name = excluded.full_name,
          title = excluded.title,
          initials = excluded.initials,
          role = excluded.role,
          staff_id = excluded.staff_id,
          onboarding_step = 'profile',
          clerk_user_id = coalesce(public.profiles.clerk_user_id, excluded.clerk_user_id);

    update public.team_members tm
    set
      name = v_full_name,
      title = v_title,
      initials = v_initials,
      email = coalesce(p_email, tm.email),
      invite_expires_at = null,
      locked = false
    where tm.id = invite_staff;

    update public.account_invites
    set accepted_at = coalesce(accepted_at, now()),
        used_at = now()
    where staff_id = invite_staff
      and used_at is null;
    return;
  end if;

  if existing_id is not null then
    return;
  end if;

  insert into public.companies (name)
  values (v_company_name)
  returning id into new_company_id;

  insert into public.team_members (company_id, name, title, role, initials, email)
  values (new_company_id, v_full_name, v_title, 'company_admin', v_initials, coalesce(p_email, ''))
  returning id into new_staff_id;

  insert into public.profiles (
    id, company_id, full_name, title, initials, role, staff_id, clerk_user_id
  )
  values (
    p_id,
    new_company_id,
    v_full_name,
    v_title,
    v_initials,
    'company_admin',
    new_staff_id,
    p_clerk_sub
  )
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id,
        clerk_user_id = coalesce(public.profiles.clerk_user_id, excluded.clerk_user_id);
end;
$$;

alter function public.provision_clerk_user(uuid, text, text, jsonb) owner to postgres;
alter function public.provision_clerk_user(uuid, text, text, jsonb) reset row_security;
revoke all on function public.provision_clerk_user(uuid, text, text, jsonb) from public;

-- Join an invite for someone who already has a Clerk user. Called with the service role.
create or replace function public.claim_invite_for_clerk(
  p_clerk_sub text,
  p_email text,
  p_full_name text,
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  uid uuid;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
  seat_title text;
  v_full_name text;
  v_initials text;
  old_company uuid;
begin
  begin
    perform set_config('row_security', 'off', true);
  exception
    when others then null;
  end;

  if coalesce(p_clerk_sub, '') = '' then
    raise exception 'Sign in to accept this invite.';
  end if;

  select id, company_id into uid, old_company
  from public.profiles
  where clerk_user_id = p_clerk_sub
  limit 1;

  if uid is null then
    uid := gen_random_uuid();
  end if;

  update public.account_invites
  set used_at = now(),
      accepted_at = coalesce(accepted_at, now())
  where token = p_token
    and used_at is null
    and declined_at is null
    and expires_at > now()
  returning company_id, staff_id, email
    into invite_company, invite_staff, invite_email;

  if invite_company is null then
    raise exception 'That invite is missing, already used, or expired.';
  end if;

  select tm.role, tm.title
    into invite_role, seat_title
  from public.team_members tm
  where tm.id = invite_staff
    and coalesce(tm.locked, false) = false;

  if invite_role is null then
    update public.account_invites
    set used_at = null
    where token = p_token and staff_id = invite_staff;
    raise exception 'That invite is missing, already used, or expired.';
  end if;

  if nullif(trim(coalesce(invite_email, '')), '') is not null
     and lower(trim(invite_email)) is distinct from lower(trim(coalesce(p_email, ''))) then
    update public.account_invites
    set used_at = null
    where token = p_token and staff_id = invite_staff;
    raise exception 'Sign in with the email this invite was sent to.';
  end if;

  v_full_name := coalesce(
    nullif(trim(coalesce(p_full_name, '')), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Teammate'
  );
  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');

  insert into public.profiles (
    id, company_id, full_name, title, initials, role, staff_id, onboarding_step, clerk_user_id
  )
  values (
    uid, invite_company, v_full_name, seat_title, v_initials, invite_role, invite_staff, 'profile', p_clerk_sub
  )
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id,
        onboarding_step = 'profile',
        clerk_user_id = coalesce(public.profiles.clerk_user_id, excluded.clerk_user_id);

  update public.team_members tm
  set
    name = v_full_name,
    title = seat_title,
    initials = v_initials,
    email = coalesce(nullif(trim(p_email), ''), tm.email),
    invite_expires_at = null,
    locked = false
  where tm.id = invite_staff;

  if old_company is not null
     and old_company is distinct from invite_company
     and not exists (select 1 from public.profiles p where p.company_id = old_company and p.id <> uid)
     and not exists (select 1 from public.jobs j where j.company_id = old_company)
     and not exists (select 1 from public.contacts c where c.company_id = old_company)
     and not exists (select 1 from public.opportunities o where o.company_id = old_company) then
    begin
      delete from public.team_members where company_id = old_company;
      delete from public.companies where id = old_company;
    exception
      when others then null;
    end;
  end if;

  return invite_company;
end;
$$;

alter function public.claim_invite_for_clerk(text, text, text, text) owner to postgres;
alter function public.claim_invite_for_clerk(text, text, text, text) reset row_security;
revoke all on function public.claim_invite_for_clerk(text, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.provision_clerk_user(uuid, text, text, jsonb) to service_role;
    grant execute on function public.claim_invite_for_clerk(text, text, text, text) to service_role;
  end if;
end $$;

-- Clerk session subjects are not uuids. These functions were recreated after
-- the auth.uid() rewrite, so point them at the linked profile.
create or replace function public.claim_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  uid uuid := public.current_profile_id();
  clerk_sub text := nullif(auth.jwt() ->> 'sub', '');
  is_clerk boolean := clerk_sub is not null
    and clerk_sub !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  user_email text := nullif(lower(trim(coalesce(
    auth.jwt() ->> 'email',
    auth.jwt() ->> 'email_address',
    ''
  ))), '');
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
  seat_title text;
  v_full_name text;
  v_initials text;
  old_company uuid;
begin
  begin
    perform set_config('row_security', 'off', true);
  exception
    when others then null;
  end;

  if uid is null and is_clerk then
    uid := gen_random_uuid();
  end if;
  if uid is null then
    raise exception 'Sign in to accept this invite.';
  end if;

  if user_email is null and not is_clerk then
    select lower(u.email) into user_email
    from auth.users u
    where u.id = uid;
  end if;

  select company_id into old_company
  from public.profiles
  where id = uid;

  v_full_name := coalesce(
    nullif(trim(coalesce(auth.jwt() ->> 'full_name', '')), ''),
    nullif(trim(coalesce(auth.jwt() ->> 'name', '')), ''),
    (select full_name from public.profiles where id = uid),
    nullif(split_part(coalesce(user_email, ''), '@', 1), ''),
    'Teammate'
  );

  update public.account_invites
  set used_at = now(),
      accepted_at = coalesce(accepted_at, now())
  where token = p_token
    and used_at is null
    and declined_at is null
    and expires_at > now()
  returning company_id, staff_id, email
    into invite_company, invite_staff, invite_email;

  if invite_company is null then
    raise exception 'That invite is missing, already used, or expired.';
  end if;

  select tm.role, tm.title
    into invite_role, seat_title
  from public.team_members tm
  where tm.id = invite_staff
    and coalesce(tm.locked, false) = false;

  if invite_role is null then
    update public.account_invites
    set used_at = null
    where token = p_token and staff_id = invite_staff;
    raise exception 'That invite is missing, already used, or expired.';
  end if;

  if nullif(trim(coalesce(invite_email, '')), '') is not null
     and lower(trim(invite_email)) is distinct from lower(trim(coalesce(user_email, ''))) then
    update public.account_invites
    set used_at = null
    where token = p_token and staff_id = invite_staff;
    raise exception 'Sign in with the email this invite was sent to.';
  end if;

  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');

  insert into public.profiles (
    id, company_id, full_name, title, initials, role, staff_id, onboarding_step, clerk_user_id
  )
  select
    uid,
    invite_company,
    v_full_name,
    seat_title,
    v_initials,
    invite_role,
    invite_staff,
    'profile',
    case when is_clerk then clerk_sub else null end
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id,
        onboarding_step = 'profile',
        clerk_user_id = coalesce(public.profiles.clerk_user_id, excluded.clerk_user_id);

  update public.team_members tm
  set
    name = v_full_name,
    title = seat_title,
    initials = v_initials,
    email = coalesce(user_email, tm.email),
    invite_expires_at = null,
    locked = false
  where tm.id = invite_staff;

  if old_company is not null
     and old_company is distinct from invite_company
     and not exists (select 1 from public.profiles p where p.company_id = old_company and p.id <> uid)
     and not exists (select 1 from public.jobs j where j.company_id = old_company)
     and not exists (select 1 from public.contacts c where c.company_id = old_company)
     and not exists (select 1 from public.opportunities o where o.company_id = old_company) then
    begin
      delete from public.team_members where company_id = old_company;
      delete from public.companies where id = old_company;
    exception
      when others then null;
    end;
  end if;

  return invite_company;
end;
$$;

alter function public.claim_invite(text) owner to postgres;
alter function public.claim_invite(text) reset row_security;

create or replace function public.save_invite_profile(
  p_phone text,
  p_radius integer,
  p_time_zone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_profile_id();
  sid uuid;
  digits text;
begin
  if uid is null then
    raise exception 'Sign in to save your profile.';
  end if;

  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) >= 11 and left(digits, 1) = '1' then
    digits := substring(digits from 2);
  end if;
  if length(digits) < 10 then
    raise exception 'Enter a mobile phone number.';
  end if;
  if p_radius is null or p_radius < 10 or p_radius > 100 or p_radius % 5 <> 0 then
    raise exception 'Choose a job site radius between 10 and 100 miles.';
  end if;
  if nullif(trim(coalesce(p_time_zone, '')), '') is null then
    raise exception 'Choose a time zone.';
  end if;

  select staff_id into sid from public.profiles where id = uid;
  if sid is null then
    raise exception 'No seat is linked to this account.';
  end if;

  update public.team_members
  set
    phone = trim(p_phone),
    job_radius_miles = p_radius,
    time_zone = trim(p_time_zone)
  where id = sid;

  update public.profiles
  set
    onboarding_step = case when onboarding_step = 'done' then 'done' else 'tools' end,
    onboarding_tasks = coalesce(onboarding_tasks, '{}'::jsonb) || jsonb_build_object('profile', to_jsonb(now()))
  where id = uid;
end;
$$;

alter function public.save_invite_profile(text, integer, text) owner to postgres;
alter function public.save_invite_profile(text, integer, text) reset row_security;

create or replace function public.finish_invite_tools()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_profile_id();
begin
  if uid is null then
    raise exception 'Sign in to finish setup.';
  end if;
  update public.profiles
  set onboarding_step = 'done'
  where id = uid
    and onboarding_step = 'tools';
end;
$$;

alter function public.finish_invite_tools() owner to postgres;
alter function public.finish_invite_tools() reset row_security;

create or replace function public.mark_onboarding_task(p_task text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_profile_id();
begin
  if uid is null then
    return;
  end if;
  if p_task not in ('profile', 'calendar', 'gmail', 'lead', 'photo') then
    return;
  end if;
  update public.profiles
  set onboarding_tasks = coalesce(onboarding_tasks, '{}'::jsonb) || jsonb_build_object(p_task, to_jsonb(now()))
  where id = uid
    and onboarding_step is not null
    and coalesce(onboarding_tasks->>p_task, '') = '';
end;
$$;

alter function public.mark_onboarding_task(text) owner to postgres;
alter function public.mark_onboarding_task(text) reset row_security;

drop policy if exists "read own notices" on public.staff_notices;
create policy "read own notices" on public.staff_notices
  for select to authenticated
  using (profile_id = public.current_profile_id());

drop policy if exists "update own notices" on public.staff_notices;
create policy "update own notices" on public.staff_notices
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

notify pgrst, 'reload schema';
