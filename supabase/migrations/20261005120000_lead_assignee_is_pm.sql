-- "Assigned to" on a new lead is that person's project manager.
-- A profile for the owner is enough; the seat does not have to be project_manager.
-- When the person who opens or assigns the lead keeps it, assigned_by matches
-- assigned_to so the desk can offer only an appointment or skip.
-- Existing unassigned rows are left alone so this does not page every open desk.

alter table public.leads
  add column if not exists assigned_by uuid references public.profiles (id) on delete set null;

create or replace function public.leads_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.assigned_to is not null
    and old.passed_back_by is not null
    and new.assigned_to = old.passed_back_by then
    raise exception 'cannot assign a lead back to the rep who passed it';
  end if;
  if tg_op = 'UPDATE' then
    if new.assigned_to is distinct from old.assigned_to then
      new.assigned_by = auth.uid();
    end if;
    new.updated_at = now();
  end if;
  return new;
end;
$$;

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
  v_status text;
  v_assigned uuid;
begin
  if new.primary_contact_id is not null then
    select c.name, c.phone
      into v_homeowner, v_phone
    from public.contacts c
    where c.id = new.primary_contact_id;
    v_homeowner := coalesce(nullif(v_homeowner, ''), new.name, '');
    v_phone := coalesce(v_phone, '');
  end if;

  if tg_op = 'INSERT' then
    v_profile := null;
    if new.owner_staff_id is not null then
      select p.id
        into v_profile
      from public.profiles p
      join public.team_members tm on tm.id = p.staff_id
      where p.staff_id = new.owner_staff_id
        and p.company_id = new.company_id
        and tm.company_id = new.company_id
        and not tm.locked
      limit 1;
    end if;

    -- The job already names this project manager. Do not open an unassigned
    -- seed that would ask someone to assign it again.
    if new.owner_staff_id is not null and v_profile is null then
      return new;
    end if;

    if v_profile is not null then
      v_status := 'assigned';
      v_assigned := v_profile;
    else
      v_status := 'unassigned';
      v_assigned := null;
    end if;

    insert into public.leads (
      company_id,
      opportunity_id,
      status,
      assigned_to,
      assigned_by,
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
      case when v_assigned is not null then auth.uid() else null end,
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
      phone = v_phone
  where l.opportunity_id = new.id
    and (
      l.homeowner_name is distinct from v_homeowner
      or l.street is distinct from coalesce(new.street, '')
      or l.city is distinct from coalesce(new.city, '')
      or l.service_type is distinct from coalesce(new.project_type::text, '')
      or l.source is distinct from coalesce(new.lead_source, '')
      or l.phone is distinct from v_phone
    );
  return new;
end;
$$;

revoke all on function public.leads_before_write() from public;
revoke all on function public.sync_lead_from_opportunity() from public;
