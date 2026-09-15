-- Invite tokens are one-time: preview and claim ignore a used or expired row.
-- claim_invite stamps used_at first so two people cannot consume the same link.

alter table public.account_invites
  add column if not exists used_at timestamptz;

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

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  select uid, invite_company, v_full_name, seat_title, v_initials, invite_role, invite_staff
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;

  update public.team_members tm
  set
    name = v_full_name,
    title = seat_title,
    initials = v_initials,
    email = coalesce(user_email, tm.email),
    invite_expires_at = null,
    locked = false
  where tm.id = invite_staff;

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

revoke all on function public.claim_invite(text) from public;
grant execute on function public.claim_invite(text) to authenticated;

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
    and i.expires_at > now()
    and coalesce(tm.locked, false) = false
  limit 1;
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
