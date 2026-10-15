-- Invited seats: accept reserves the link, decline voids it, and setup continues
-- after the account exists. The invite row stays so a one-time renewal request
-- can still reach the person who sent it.

alter table public.account_invites
  add column if not exists used_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists reinvite_requested_at timestamptz;

alter table public.team_members
  add column if not exists job_radius_miles integer,
  add column if not exists time_zone text not null default '';

alter table public.profiles
  add column if not exists onboarding_step text,
  add column if not exists onboarding_tasks jsonb not null default '{}'::jsonb;

create table if not exists public.staff_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists staff_notices_profile_idx
  on public.staff_notices (profile_id, created_at desc);

alter table public.staff_notices enable row level security;

drop policy if exists "read own notices" on public.staff_notices;
create policy "read own notices" on public.staff_notices
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "update own notices" on public.staff_notices;
create policy "update own notices" on public.staff_notices
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, update on public.staff_notices to authenticated;

create or replace function public.leave_invite_notice(
  p_company uuid,
  p_profile uuid,
  p_kind text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile is null or nullif(trim(coalesce(p_body, '')), '') is null then
    return;
  end if;
  insert into public.staff_notices (company_id, profile_id, kind, body)
  values (p_company, p_profile, p_kind, trim(p_body));
end;
$$;

alter function public.leave_invite_notice(uuid, uuid, text, text) owner to postgres;
alter function public.leave_invite_notice(uuid, uuid, text, text) reset row_security;
revoke all on function public.leave_invite_notice(uuid, uuid, text, text) from public;

create or replace function public.invite_preview(p_token text)
returns table (
  company_id uuid,
  company_name text,
  seat_name text,
  seat_title text,
  seat_role public.seat_role,
  email text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as company_id,
    c.name as company_name,
    tm.name as seat_name,
    tm.title as seat_title,
    tm.role as seat_role,
    i.email,
    i.expires_at
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  join public.companies c on c.id = i.company_id
  where i.token = p_token
    and i.used_at is null
    and i.declined_at is null
    and i.expires_at > now()
    and coalesce(tm.locked, false) = false
  limit 1;
$$;

alter function public.invite_preview(text) owner to postgres;

create or replace function public.invite_gate(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  row record;
begin
  if nullif(trim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('status', 'missing');
  end if;

  select
    i.company_id,
    i.used_at,
    i.declined_at,
    i.accepted_at,
    i.expires_at,
    i.reinvite_requested_at,
    i.email,
    c.name as company_name,
    tm.name as seat_name,
    tm.title as seat_title,
    tm.role as seat_role,
    coalesce(tm.locked, false) as seat_locked
  into row
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  join public.companies c on c.id = i.company_id
  where i.token = trim(p_token)
  limit 1;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  return jsonb_build_object(
    'companyId', row.company_id,
    'status', case
      when row.seat_locked then 'missing'
      when row.declined_at is not null then 'declined'
      when row.used_at is not null then 'used'
      when row.expires_at <= now() then 'expired'
      when row.accepted_at is not null then 'accepted'
      else 'open'
    end,
    'companyName', row.company_name,
    'seatName', row.seat_name,
    'seatTitle', row.seat_title,
    'seatRole', row.seat_role,
    'email', row.email,
    'expiresAt', row.expires_at,
    'reinviteRequested', row.reinvite_requested_at is not null
  );
end;
$$;

alter function public.invite_gate(text) owner to postgres;
alter function public.invite_gate(text) reset row_security;

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.account_invites
  set accepted_at = coalesce(accepted_at, now())
  where token = trim(coalesce(p_token, ''))
    and used_at is null
    and declined_at is null
    and expires_at > now();
  return public.invite_gate(p_token);
end;
$$;

alter function public.accept_invite(text) owner to postgres;
alter function public.accept_invite(text) reset row_security;

create or replace function public.decline_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_company uuid;
  invite_profile uuid;
  seat_name text;
  company_name text;
  invite_email text;
begin
  update public.account_invites i
  set declined_at = now()
  from public.team_members tm, public.companies c
  where i.token = trim(coalesce(p_token, ''))
    and i.used_at is null
    and i.declined_at is null
    and tm.id = i.staff_id
    and c.id = i.company_id
  returning i.company_id, i.created_by, tm.name, c.name, i.email
    into invite_company, invite_profile, seat_name, company_name, invite_email;

  if invite_company is not null then
    perform public.leave_invite_notice(
      invite_company,
      invite_profile,
      'invite_declined',
      trim(both ' ' from coalesce(seat_name, 'Someone'))
        || ' (' || trim(coalesce(invite_email, '')) || ') declined the invite to '
        || coalesce(company_name, 'the company') || '.'
    );
  end if;

  return public.invite_gate(p_token);
end;
$$;

alter function public.decline_invite(text) owner to postgres;
alter function public.decline_invite(text) reset row_security;

create or replace function public.request_invite_renewal(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_company uuid;
  invite_profile uuid;
  seat_name text;
  company_name text;
  invite_email text;
begin
  update public.account_invites i
  set reinvite_requested_at = now()
  from public.team_members tm, public.companies c
  where i.token = trim(coalesce(p_token, ''))
    and i.reinvite_requested_at is null
    and tm.id = i.staff_id
    and c.id = i.company_id
  returning i.company_id, i.created_by, tm.name, c.name, i.email
    into invite_company, invite_profile, seat_name, company_name, invite_email;

  if invite_company is null then
    if exists (
      select 1 from public.account_invites
      where token = trim(coalesce(p_token, ''))
    ) then
      return 'already';
    end if;
    return 'missing';
  end if;

  perform public.leave_invite_notice(
    invite_company,
    invite_profile,
    'invite_renewal',
    trim(both ' ' from coalesce(seat_name, 'Someone'))
      || ' (' || trim(coalesce(invite_email, '')) || ') asked for a new invite to '
      || coalesce(company_name, 'the company') || '.'
  );
  return 'sent';
end;
$$;

alter function public.request_invite_renewal(text) owner to postgres;
alter function public.request_invite_renewal(text) reset row_security;

-- Joining an accepted invite keeps the row (used_at) and starts setup.
create or replace function public.provision_auth_user(
  p_id uuid,
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
  old_company uuid;
begin
  begin
    perform set_config('row_security', 'off', true);
  exception
    when others then null;
  end;

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
      and i.accepted_at is not null
      and i.expires_at > now()
      and coalesce(tm.locked, false) = false;

    if invite_company is not null
       and (
         nullif(trim(coalesce(invite_email, '')), '') is null
         or lower(trim(invite_email)) = lower(trim(coalesce(p_email, '')))
       ) then
      insert into public.profiles (
        id, company_id, full_name, title, initials, role, staff_id, onboarding_step
      )
      values (
        p_id,
        invite_company,
        v_full_name,
        v_title,
        v_initials,
        invite_role,
        invite_staff,
        'profile'
      )
      on conflict (id) do update
        set company_id = excluded.company_id,
            full_name = excluded.full_name,
            title = excluded.title,
            initials = excluded.initials,
            role = excluded.role,
            staff_id = excluded.staff_id,
            onboarding_step = 'profile';

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
      set used_at = now()
      where staff_id = invite_staff
        and used_at is null;
      return;
    end if;
  end if;

  select company_id into old_company
  from public.profiles
  where id = p_id;

  if old_company is not null then
    return;
  end if;

  insert into public.companies (name)
  values (v_company_name)
  returning id into new_company_id;

  insert into public.team_members (company_id, name, title, role, initials, email)
  values (new_company_id, v_full_name, v_title, 'company_admin', v_initials, coalesce(p_email, ''))
  returning id into new_staff_id;

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (
    p_id,
    new_company_id,
    v_full_name,
    v_title,
    v_initials,
    'company_admin',
    new_staff_id
  )
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;
end;
$$;

alter function public.provision_auth_user(uuid, text, jsonb) owner to postgres;
alter function public.provision_auth_user(uuid, text, jsonb) reset row_security;

create or replace function public.claim_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  uid uuid := auth.uid();
  user_email text;
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

  if uid is null then
    raise exception 'Sign in to accept this invite.';
  end if;

  select u.email,
         coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
    into user_email, v_full_name
  from auth.users u
  where u.id = uid;

  update public.account_invites
  set used_at = now()
  where token = p_token
    and used_at is null
    and declined_at is null
    and accepted_at is not null
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

  select company_id into old_company
  from public.profiles
  where id = uid;

  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id, onboarding_step)
  select uid, invite_company, v_full_name, seat_title, v_initials, invite_role, invite_staff, 'profile'
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id,
        onboarding_step = 'profile';

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
     and not exists (select 1 from public.profiles p where p.company_id = old_company)
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
  uid uuid := auth.uid();
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
  uid uuid := auth.uid();
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
  uid uuid := auth.uid();
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

revoke all on function public.invite_gate(text) from public;
revoke all on function public.accept_invite(text) from public;
revoke all on function public.decline_invite(text) from public;
revoke all on function public.request_invite_renewal(text) from public;
revoke all on function public.save_invite_profile(text, integer, text) from public;
revoke all on function public.finish_invite_tools() from public;
revoke all on function public.mark_onboarding_task(text) from public;
revoke all on function public.claim_invite(text) from public;
revoke all on function public.invite_preview(text) from public;

grant execute on function public.invite_gate(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to anon, authenticated;
grant execute on function public.decline_invite(text) to anon, authenticated;
grant execute on function public.request_invite_renewal(text) to anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.claim_invite(text) to authenticated;
grant execute on function public.save_invite_profile(text, integer, text) to authenticated;
grant execute on function public.finish_invite_tools() to authenticated;
grant execute on function public.mark_onboarding_task(text) to authenticated;
