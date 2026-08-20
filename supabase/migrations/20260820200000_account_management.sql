-- Account management: invite teammates into an existing company, lock, and restrict.

alter table public.team_members
  add column if not exists email text not null default '',
  add column if not exists locked boolean not null default false,
  add column if not exists restricted boolean not null default false,
  add column if not exists invite_expires_at timestamptz;

create unique index if not exists team_members_company_email_idx
  on public.team_members (company_id, lower(email))
  where email <> '';

create table if not exists public.account_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  email text not null,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists account_invites_company_id_idx on public.account_invites (company_id);
create index if not exists account_invites_token_idx on public.account_invites (token);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'account_invites_staff_id_key'
  ) then
    alter table public.account_invites
      add constraint account_invites_staff_id_key unique (staff_id);
  end if;
end $$;

alter table public.account_invites enable row level security;

drop policy if exists "admin manage invites" on public.account_invites;
create policy "admin manage invites" on public.account_invites
  for all to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin())
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

drop policy if exists "admin update company profiles" on public.profiles;
create policy "admin update company profiles" on public.profiles
  for update to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin())
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

drop policy if exists "admin delete company profiles" on public.profiles;
create policy "admin delete company profiles" on public.profiles
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_is_company_admin()
    and id is distinct from auth.uid()
  );

drop policy if exists "company isolation" on public.team_members;
drop policy if exists "read company seats" on public.team_members;
drop policy if exists "admin write seats" on public.team_members;

create policy "read company seats" on public.team_members
  for select to authenticated
  using (company_id = public.current_company_id());

create policy "admin write seats" on public.team_members
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

create policy "admin update seats" on public.team_members
  for update to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin())
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

create policy "admin delete seats" on public.team_members
  for delete to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin());

create or replace function public.current_is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role = 'company_admin'
        and coalesce(tm.locked, false) = false
        and coalesce(tm.restricted, false) = false
      from public.profiles p
      left join public.team_members tm on tm.id = p.staff_id
      where p.id = auth.uid()
    ),
    false
  )
$$;

create or replace function public.invite_preview(p_token text)
returns table (
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
    and tm.locked = false
  limit 1;
end;
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

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
  full_name text;
  initials text;
begin
  if uid is null then
    raise exception 'Sign in to accept this invite.';
  end if;

  select u.email, coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
    into user_email, full_name
  from auth.users u
  where u.id = uid;

  select i.company_id, i.staff_id, i.email, tm.role, tm.title
    into invite_company, invite_staff, invite_email, invite_role, seat_title
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  where i.token = p_token
    and i.expires_at > now()
    and tm.locked = false;

  if invite_company is null then
    raise exception 'That invite is missing or expired.';
  end if;

  if lower(invite_email) is distinct from lower(coalesce(user_email, '')) then
    raise exception 'Sign in with the email this invite was sent to.';
  end if;

  initials := upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), '');

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (uid, invite_company, full_name, seat_title, initials, invite_role, invite_staff)
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;

  update public.team_members
  set
    name = full_name,
    title = seat_title,
    initials = initials,
    email = coalesce(user_email, email),
    invite_expires_at = null,
    locked = false
  where id = invite_staff;

  delete from public.account_invites where staff_id = invite_staff;
  return invite_company;
end;
$$;

revoke all on function public.claim_invite(text) from public;
grant execute on function public.claim_invite(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  new_staff_id uuid;
  full_name text;
  title text;
  company_name text;
  initials text;
  invite_token text;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  title := coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), 'Company admin');
  company_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company'), ''), 'Truss');
  initials := upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), '');
  invite_token := nullif(trim(new.raw_user_meta_data->>'invite_token'), '');

  if invite_token is not null then
    select i.company_id, i.staff_id, i.email, tm.role
      into invite_company, invite_staff, invite_email, invite_role
    from public.account_invites i
    join public.team_members tm on tm.id = i.staff_id
    where i.token = invite_token
      and i.expires_at > now()
      and tm.locked = false;

    if invite_company is null then
      raise exception 'That invite is missing or expired.';
    end if;

    if lower(invite_email) is distinct from lower(new.email) then
      raise exception 'Sign up with the email this invite was sent to.';
    end if;

    insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
    values (
      new.id,
      invite_company,
      full_name,
      coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), title),
      initials,
      invite_role,
      invite_staff
    );

    update public.team_members
    set
      name = full_name,
      title = coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), title),
      initials = initials,
      email = new.email,
      invite_expires_at = null,
      locked = false
    where id = invite_staff;

    delete from public.account_invites where staff_id = invite_staff;
    return new;
  end if;

  insert into public.companies (name)
  values (company_name)
  returning id into new_company_id;

  insert into public.team_members (company_id, name, title, role, initials, email)
  values (new_company_id, full_name, title, 'company_admin', initials, coalesce(new.email, ''))
  returning id into new_staff_id;

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (
    new.id,
    new_company_id,
    full_name,
    title,
    initials,
    'company_admin',
    new_staff_id
  );

  return new;
end;
$$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.account_invites';
exception
  when duplicate_object then null;
end $$;
