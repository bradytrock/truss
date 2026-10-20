-- Directors see and run the company book the way a company admin does.
-- They do not change business settings (company profile, people, payments,
-- integrations) and they do not open the Accounting Suite.

create or replace function public.current_is_company_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role in ('company_admin', 'director')
        and coalesce(tm.locked, false) = false
        and coalesce(tm.restricted, false) = false
      from public.profiles p
      left join public.team_members tm on tm.id = p.staff_id
      where p.id = auth.uid()
    ),
    false
  )
$$;

revoke all on function public.current_is_company_leader() from public;
grant execute on function public.current_is_company_leader() to authenticated;

create or replace function public.current_can_manage_automations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_is_company_leader()
    or (
      select coalesce(tm.manage_automations, false) = true
        and coalesce(tm.locked, false) = false
        and coalesce(tm.restricted, false) = false
      from public.profiles p
      left join public.team_members tm on tm.id = p.staff_id
      where p.id = auth.uid()
    ),
    false
  )
$$;

revoke all on function public.current_can_manage_automations() from public;
grant execute on function public.current_can_manage_automations() to authenticated;

create or replace function public.can_view_staff_calendar(target_staff_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid;
  viewer_team uuid;
  owner_team uuid;
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

  select tm.team_id into viewer_team from public.team_members tm where tm.id = viewer;
  select tm.team_id into owner_team from public.team_members tm where tm.id = target_staff_id;
  select coalesce(ca.share_with_team, false) into shared_team
    from public.calendar_accounts ca
    where ca.staff_id = target_staff_id
      and ca.company_id = public.current_company_id();

  if shared_team and viewer_team is not null and viewer_team = owner_team then
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

drop policy if exists "read company leads" on public.leads;
create policy "read company leads" on public.leads
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.current_is_company_leader()
      or assigned_to = auth.uid()
    )
  );

drop policy if exists "insert company leads" on public.leads;
create policy "insert company leads" on public.leads
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and (
      public.current_is_company_leader()
      or assigned_to is null
      or assigned_to = auth.uid()
    )
  );

drop policy if exists "admin updates company leads" on public.leads;
create policy "admin updates company leads" on public.leads
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_is_company_leader()
  )
  with check (
    company_id = public.current_company_id()
    and public.current_is_company_leader()
  );

drop policy if exists "read lead activity" on public.lead_activity;
create policy "read lead activity" on public.lead_activity
  for select to authenticated
  using (
    lead_activity.user_id = auth.uid()
    or (
      public.current_is_company_leader()
      and exists (
        select 1
        from public.leads l
        where l.id = lead_activity.lead_id
          and l.company_id = public.current_company_id()
      )
    )
  );

-- Unassigned website chats notify directors as well as company admins.
do $$
declare
  def text;
begin
  if to_regprocedure(
    'public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text)'
  ) is null then
    return;
  end if;
  select pg_get_functiondef(
    'public.website_chat_intake(text, text, text, text, text, text, text, text, text, text, text, text)'::regprocedure
  )
  into def;
  def := replace(def, 'm.role = ''company_admin''', 'm.role in (''company_admin'', ''director'')');
  def := replace(def, 'open_admin.role = ''company_admin''', 'open_admin.role in (''company_admin'', ''director'')');
  def := replace(
    def,
    'Waiting for a company admin to assign it.',
    'Waiting for a company admin or director to assign it.'
  );
  execute def;
end $$;
