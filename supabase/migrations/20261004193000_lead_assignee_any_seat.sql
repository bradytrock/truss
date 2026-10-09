-- Assigned to on a new lead is the project manager, whatever their seat.
-- A project manager, estimator, team lead, or anyone else with an unlocked seat can take it.

create or replace function public.sync_lead_from_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := '';
  v_homeowner text := coalesce(new.name, '');
  v_profile uuid;
  v_name text := '';
  v_status text;
  v_assigned uuid;
  v_owner_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    v_owner_changed := true;
  elsif tg_op = 'UPDATE' then
    v_owner_changed := new.owner_staff_id is distinct from old.owner_staff_id;
  end if;
  if new.primary_contact_id is not null then
    select c.name, c.phone
      into v_homeowner, v_phone
    from public.contacts c
    where c.id = new.primary_contact_id;
    v_homeowner := coalesce(nullif(v_homeowner, ''), new.name, '');
    v_phone := coalesce(v_phone, '');
  end if;

  v_profile := null;
  if new.owner_staff_id is not null then
    select p.id, tm.name
      into v_profile, v_name
    from public.team_members tm
    left join public.profiles p
      on p.staff_id = tm.id
     and p.company_id = tm.company_id
    where tm.id = new.owner_staff_id
      and tm.company_id = new.company_id
      and not tm.locked
    limit 1;
  end if;
  v_name := coalesce(v_name, '');
  if v_profile is not null then
    v_status := 'assigned';
    v_assigned := v_profile;
  else
    v_status := 'unassigned';
    v_assigned := null;
  end if;

  if v_owner_changed and v_name <> '' then
    update public.jobs
    set owner_staff_id = new.owner_staff_id,
        project_manager = v_name
    where opportunity_id = new.id
      and deleted_at is null
      and (
        owner_staff_id is distinct from new.owner_staff_id
        or project_manager is distinct from v_name
      );
  end if;

  if tg_op = 'INSERT' then
    insert into public.leads (
      company_id,
      opportunity_id,
      status,
      assigned_to,
      homeowner_name,
      street,
      city,
      service_type,
      source,
      phone
    ) values (
      new.company_id,
      new.id,
      v_status,
      v_assigned,
      v_homeowner,
      coalesce(new.street, ''),
      coalesce(new.city, ''),
      coalesce(new.project_type::text, ''),
      coalesce(new.lead_source, ''),
      v_phone
    )
    on conflict (opportunity_id) where opportunity_id is not null do nothing;
    return new;
  end if;

  update public.leads l
  set homeowner_name = v_homeowner,
      street = coalesce(new.street, ''),
      city = coalesce(new.city, ''),
      service_type = coalesce(new.project_type::text, ''),
      source = coalesce(new.lead_source, ''),
      phone = v_phone,
      status = case when v_owner_changed then v_status else l.status end,
      assigned_to = case when v_owner_changed then v_assigned else l.assigned_to end
  where l.opportunity_id = new.id
    and (
      l.homeowner_name is distinct from v_homeowner
      or l.street is distinct from coalesce(new.street, '')
      or l.city is distinct from coalesce(new.city, '')
      or l.service_type is distinct from coalesce(new.project_type::text, '')
      or l.source is distinct from coalesce(new.lead_source, '')
      or l.phone is distinct from v_phone
      or (v_owner_changed and (l.status is distinct from v_status or l.assigned_to is distinct from v_assigned))
    );
  return new;
end;
$$;

drop trigger if exists opportunities_sync_lead on public.opportunities;
create trigger opportunities_sync_lead
  after insert or update of name, street, city, project_type, lead_source, primary_contact_id, owner_staff_id
  on public.opportunities
  for each row execute function public.sync_lead_from_opportunity();

-- The costing job is inserted after the lead. Whoever was assigned owns it as project manager.
create or replace function public.jobs_set_project_manager_from_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.owner_staff_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.owner_staff_id is not distinct from old.owner_staff_id then
      return new;
    end if;
  end if;
  -- Lead create already writes the assignee's name. Fill it when a path only set the owner.
  if btrim(coalesce(new.project_manager, '')) <> '' then
    return new;
  end if;
  select tm.name
    into v_name
  from public.team_members tm
  where tm.id = new.owner_staff_id
    and tm.company_id = new.company_id
    and not tm.locked;
  if v_name is not null and btrim(v_name) <> '' then
    new.project_manager := v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_set_project_manager_from_owner on public.jobs;
create trigger jobs_set_project_manager_from_owner
  before insert or update of owner_staff_id on public.jobs
  for each row execute function public.jobs_set_project_manager_from_owner();

revoke all on function public.jobs_set_project_manager_from_owner() from public;
