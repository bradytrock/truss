-- Safe to re-run. Unblocks invite signup ("Database error saving new user").
-- SET row_security = off on handle_new_user aborts Auth when the function is
-- still owned by supabase_auth_admin (CREATE OR REPLACE does not change owner).
-- Strip that setting and take ownership before recreating anything else.

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'alter function public.handle_new_user() reset row_security';
    execute 'alter function public.handle_new_user() owner to postgres';
  end if;
  if to_regprocedure('public.provision_auth_user(uuid, text, jsonb)') is not null then
    execute 'alter function public.provision_auth_user(uuid, text, jsonb) reset row_security';
    execute 'alter function public.provision_auth_user(uuid, text, jsonb) owner to postgres';
  end if;
  if to_regprocedure('public.claim_invite(text)') is not null then
    execute 'alter function public.claim_invite(text) reset row_security';
    execute 'alter function public.claim_invite(text) owner to postgres';
  end if;
  if to_regprocedure('public.invite_preview(text)') is not null then
    execute 'alter function public.invite_preview(text) reset row_security';
    execute 'alter function public.invite_preview(text) owner to postgres';
  end if;
end $$;

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
      and i.expires_at > now()
      and coalesce(tm.locked, false) = false;

    if invite_company is not null
       and (
         nullif(trim(coalesce(invite_email, '')), '') is null
         or lower(trim(invite_email)) = lower(trim(coalesce(p_email, '')))
       ) then
      insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
      values (
        p_id,
        invite_company,
        v_full_name,
        v_title,
        v_initials,
        invite_role,
        invite_staff
      )
      on conflict (id) do update
        set company_id = excluded.company_id,
            full_name = excluded.full_name,
            title = excluded.title,
            initials = excluded.initials,
            role = excluded.role,
            staff_id = excluded.staff_id;

      update public.team_members
      set
        name = v_full_name,
        title = v_title,
        initials = v_initials,
        email = coalesce(p_email, email),
        invite_expires_at = null,
        locked = false
      where id = invite_staff;

      delete from public.account_invites where staff_id = invite_staff;
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.provision_auth_user(new.id, new.email, new.raw_user_meta_data);
  exception
    when others then null;
  end;
  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
alter function public.handle_new_user() reset row_security;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.claim_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  select i.company_id, i.staff_id, i.email, tm.role, tm.title
    into invite_company, invite_staff, invite_email, invite_role, seat_title
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  where i.token = p_token
    and i.expires_at > now()
    and coalesce(tm.locked, false) = false;

  if invite_company is null then
    raise exception 'That invite is missing or expired.';
  end if;

  if nullif(trim(coalesce(invite_email, '')), '') is not null
     and lower(trim(invite_email)) is distinct from lower(trim(coalesce(user_email, ''))) then
    raise exception 'Sign in with the email this invite was sent to.';
  end if;

  select company_id into old_company
  from public.profiles
  where id = uid;

  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (uid, invite_company, v_full_name, seat_title, v_initials, invite_role, invite_staff)
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;

  update public.team_members
  set
    name = v_full_name,
    title = seat_title,
    initials = v_initials,
    email = coalesce(user_email, team_members.email),
    invite_expires_at = null,
    locked = false
  where id = invite_staff;

  delete from public.account_invites where staff_id = invite_staff;

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

drop function if exists public.invite_preview(text);

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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id,
    c.name,
    tm.name,
    tm.title,
    tm.role,
    i.email,
    i.expires_at
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  join public.companies c on c.id = i.company_id
  where i.token = p_token
    and i.expires_at > now()
    and coalesce(tm.locked, false) = false
  limit 1;
end;
$$;

alter function public.invite_preview(text) owner to postgres;

revoke all on function public.provision_auth_user(uuid, text, jsonb) from public;
revoke all on function public.claim_invite(text) from public;
revoke all on function public.invite_preview(text) from public;

do $$
begin
  grant execute on function public.provision_auth_user(uuid, text, jsonb) to postgres;
  grant execute on function public.handle_new_user() to postgres;
  grant execute on function public.claim_invite(text) to authenticated;
  grant execute on function public.invite_preview(text) to anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant select, insert, update, delete on public.companies, public.profiles, public.team_members, public.account_invites to supabase_auth_admin;
    grant execute on function public.provision_auth_user(uuid, text, jsonb) to supabase_auth_admin;
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.provision_auth_user(uuid, text, jsonb) to service_role;
    grant execute on function public.handle_new_user() to service_role;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'drop policy if exists "auth admin invites" on public.account_invites';
    execute $p$create policy "auth admin invites" on public.account_invites
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin profiles" on public.profiles';
    execute $p$create policy "auth admin profiles" on public.profiles
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin seats" on public.team_members';
    execute $p$create policy "auth admin seats" on public.team_members
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin companies" on public.companies';
    execute $p$create policy "auth admin companies" on public.companies
      for all to supabase_auth_admin using (true) with check (true)$p$;
  end if;
end $$;
