-- A person can belong to more than one team.
-- team_members.team_id stays the primary team so existing reads keep working.
-- team_memberships is the full set, including that primary team.

create table if not exists public.team_memberships (
  staff_id uuid not null references public.team_members (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, team_id)
);

create index if not exists team_memberships_team_id_idx on public.team_memberships (team_id);
create index if not exists team_memberships_company_id_idx on public.team_memberships (company_id);

comment on table public.team_memberships is
  'Every team a person belongs to. team_members.team_id is the primary team and is kept in this set.';

comment on column public.team_members.team_id is
  'Primary team. Additional teams are rows in team_memberships.';

create or replace function public.team_memberships_same_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.team_members staff
    join public.teams team on team.company_id = staff.company_id
    where staff.id = new.staff_id
      and team.id = new.team_id
      and staff.company_id = new.company_id
  ) then
    raise exception 'Team membership must stay inside one company';
  end if;
  return new;
end;
$$;

drop trigger if exists team_memberships_same_company on public.team_memberships;
create trigger team_memberships_same_company
  before insert or update on public.team_memberships
  for each row execute function public.team_memberships_same_company();

-- Setting a primary team adds that membership and does not remove the others.
create or replace function public.ensure_primary_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is null then
    return new;
  end if;
  insert into public.team_memberships (company_id, staff_id, team_id)
  values (new.company_id, new.id, new.team_id)
  on conflict (staff_id, team_id) do nothing;
  return new;
end;
$$;

drop trigger if exists team_members_ensure_membership on public.team_members;
create trigger team_members_ensure_membership
  after insert or update of team_id on public.team_members
  for each row execute function public.ensure_primary_team_membership();

-- If the primary team is no longer a membership, pick the oldest one that remains.
create or replace function public.sync_primary_team_from_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  person uuid;
  current_primary uuid;
  next_primary uuid;
begin
  person := coalesce(new.staff_id, old.staff_id);
  select tm.team_id into current_primary
  from public.team_members tm
  where tm.id = person;
  if not found then
    return coalesce(new, old);
  end if;

  if current_primary is not null and exists (
    select 1
    from public.team_memberships m
    where m.staff_id = person
      and m.team_id = current_primary
  ) then
    return coalesce(new, old);
  end if;

  select m.team_id into next_primary
  from public.team_memberships m
  where m.staff_id = person
  order by m.created_at asc, m.team_id asc
  limit 1;

  update public.team_members
  set team_id = next_primary
  where id = person
    and team_id is distinct from next_primary;

  return coalesce(new, old);
end;
$$;

drop trigger if exists team_memberships_sync_primary on public.team_memberships;
create trigger team_memberships_sync_primary
  after insert or delete on public.team_memberships
  for each row execute function public.sync_primary_team_from_memberships();

insert into public.team_memberships (company_id, staff_id, team_id)
select company_id, id, team_id
from public.team_members
where team_id is not null
on conflict (staff_id, team_id) do nothing;

alter table public.team_memberships enable row level security;

drop policy if exists "company isolation" on public.team_memberships;
create policy "company isolation" on public.team_memberships
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

revoke all on public.team_memberships from anon, public;
grant select, insert, update, delete on public.team_memberships to authenticated;

revoke all on function public.team_memberships_same_company() from public, anon, authenticated;
revoke all on function public.ensure_primary_team_membership() from public, anon, authenticated;
revoke all on function public.sync_primary_team_from_memberships() from public, anon, authenticated;

create or replace function public.staff_share_team(left_id uuid, right_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select left_id is not null
    and right_id is not null
    and exists (
      select 1
      from public.team_members l
      join public.team_members r on r.company_id = l.company_id
      where l.id = left_id
        and r.id = right_id
        and l.company_id = public.current_company_id()
    )
    and (
      exists (
        select 1
        from public.team_memberships a
        join public.team_memberships b on b.team_id = a.team_id
        where a.staff_id = left_id
          and b.staff_id = right_id
      )
      or exists (
        select 1
        from public.team_members l
        join public.team_members r on r.team_id = l.team_id
        where l.id = left_id
          and r.id = right_id
          and l.team_id is not null
      )
      or exists (
        select 1
        from public.team_memberships a
        join public.team_members r on r.team_id = a.team_id
        where a.staff_id = left_id
          and r.id = right_id
      )
      or exists (
        select 1
        from public.team_memberships b
        join public.team_members l on l.team_id = b.team_id
        where b.staff_id = right_id
          and l.id = left_id
      )
    );
$$;

revoke all on function public.staff_share_team(uuid, uuid) from public;
grant execute on function public.staff_share_team(uuid, uuid) to authenticated;

create or replace function public.can_view_staff_calendar(target_staff_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid;
  shared_team boolean;
begin
  viewer := public.current_staff_id();
  if viewer is not null and viewer = target_staff_id then
    return true;
  end if;
  if public.current_is_company_leader() then
    return true;
  end if;
  if viewer is null then
    return false;
  end if;

  select coalesce(ca.share_with_team, false) into shared_team
    from public.calendar_accounts ca
    where ca.staff_id = target_staff_id
      and ca.company_id = public.current_company_id();

  if shared_team and public.staff_share_team(viewer, target_staff_id) then
    return true;
  end if;

  return exists (
    select 1
    from public.calendar_shares s
    where s.owner_staff_id = target_staff_id
      and s.viewer_staff_id = viewer
      and s.company_id = public.current_company_id()
  );
end;
$$;

revoke all on function public.can_view_staff_calendar(uuid) from public;
grant execute on function public.can_view_staff_calendar(uuid) to authenticated;

create or replace function public.voice_lead_assign_context(
  p_token text,
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agent public.voice_agents%rowtype;
  opp public.opportunities%rowtype;
  contact_row public.contacts%rowtype;
  company_row public.companies%rowtype;
  owner_row public.team_members%rowtype;
  site text;
begin
  if coalesce(nullif(trim(p_token), ''), '') = '' or p_opportunity_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing lead.');
  end if;

  select * into agent
  from public.voice_agents
  where webhook_token = trim(p_token)
  limit 1;
  if not found or not agent.enabled then
    return jsonb_build_object('ok', false, 'error', 'Unknown or disabled voice agent.');
  end if;

  select * into opp
  from public.opportunities
  where id = p_opportunity_id
    and company_id = agent.company_id
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That lead is gone.');
  end if;

  select * into company_row from public.companies where id = agent.company_id;
  if opp.owner_staff_id is not null then
    select * into owner_row from public.team_members where id = opp.owner_staff_id;
  end if;
  if opp.primary_contact_id is not null then
    select * into contact_row from public.contacts where id = opp.primary_contact_id;
  end if;

  site := trim(both ' ' from concat_ws(', ',
    nullif(trim(coalesce(opp.street, '')), ''),
    nullif(trim(concat_ws(' ', nullif(trim(coalesce(opp.city, '')), ''), nullif(trim(coalesce(opp.state, '')), ''))), ''),
    nullif(trim(coalesce(opp.postal_code, '')), '')
  ));

  return jsonb_build_object(
    'ok', true,
    'companyName', coalesce(company_row.name, ''),
    'companyEmail', coalesce(company_row.email, ''),
    'companyId', agent.company_id,
    'ownerStaffId', owner_row.id,
    'assignedToName', coalesce(nullif(trim(owner_row.name), ''), opp.estimator, ''),
    'homeownerName', coalesce(contact_row.name, ''),
    'homeownerPhone', coalesce(contact_row.phone, ''),
    'homeownerEmail', coalesce(contact_row.email, ''),
    'propertyAddress', coalesce(nullif(site, ''), nullif(trim(opp.location), ''), 'Address TBD'),
    'notes', coalesce(opp.notes, ''),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tm.id,
        'name', tm.name,
        'email', tm.email,
        'teamId', tm.team_id,
        'teamIds', coalesce((
          select jsonb_agg(m.team_id order by (m.team_id is not distinct from tm.team_id) desc, m.created_at)
          from public.team_memberships m
          where m.staff_id = tm.id
        ), case when tm.team_id is null then '[]'::jsonb else jsonb_build_array(tm.team_id) end),
        'role', tm.role,
        'locked', tm.locked
      ))
      from public.team_members tm
      where tm.company_id = agent.company_id
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'leadStaffId', coalesce(t.lead_staff_id::text, '')
      ))
      from public.teams t
      where t.company_id = agent.company_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.voice_lead_assign_context(text, uuid) from public;
grant execute on function public.voice_lead_assign_context(text, uuid) to anon, authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.team_memberships';
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
