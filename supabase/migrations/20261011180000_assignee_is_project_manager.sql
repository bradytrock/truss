-- Changing who a lead is assigned to also names them project manager on the job.
-- Keeps the owner-follows-assignee rules from 20261010190000_lead_owner_keeps_assignment.sql.

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
begin
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
    from public.profiles p
    join public.team_members tm on tm.id = p.staff_id
    where p.staff_id = new.owner_staff_id
      and p.company_id = new.company_id
      and tm.company_id = new.company_id
      and not tm.locked
    limit 1;
  end if;
  v_name := coalesce(v_name, '');

  if tg_op = 'UPDATE' and new.owner_staff_id is distinct from old.owner_staff_id and v_name <> '' then
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
    -- The job already names this person. Do not open an unassigned
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

  -- null status means "leave the current assignee alone".
  v_status := null;
  v_assigned := null;
  if new.owner_staff_id is distinct from old.owner_staff_id then
    if new.owner_staff_id is null then
      v_status := 'unassigned';
      v_assigned := null;
    elsif v_profile is not null then
      v_status := 'assigned';
      v_assigned := v_profile;
    end if;
  end if;

  update public.leads l
  set homeowner_name = v_homeowner,
      street = coalesce(new.street, ''),
      city = coalesce(new.city, ''),
      service_type = coalesce(new.project_type::text, ''),
      source = coalesce(new.lead_source, ''),
      phone = v_phone,
      status = coalesce(v_status, l.status),
      assigned_to = case when v_status is null then l.assigned_to else v_assigned end
  where l.opportunity_id = new.id
    and l.passed_back_by is null
    and (
      l.homeowner_name is distinct from v_homeowner
      or l.street is distinct from coalesce(new.street, '')
      or l.city is distinct from coalesce(new.city, '')
      or l.service_type is distinct from coalesce(new.project_type::text, '')
      or l.source is distinct from coalesce(new.lead_source, '')
      or l.phone is distinct from v_phone
      or (
        v_status is not null
        and (
          l.status is distinct from v_status
          or l.assigned_to is distinct from v_assigned
        )
      )
    );
  return new;
end;
$$;
