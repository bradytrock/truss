-- An opportunity owner is the assignee. Changing that owner has to move the
-- lead with it, or the desk keeps asking someone to assign a lead that
-- already has a person.

alter table public.leads
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null;

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

drop trigger if exists opportunities_sync_lead on public.opportunities;
create trigger opportunities_sync_lead
  after insert or update of name, street, city, project_type, lead_source, primary_contact_id, owner_staff_id
  on public.opportunities
  for each row execute function public.sync_lead_from_opportunity();

-- Leads that already name an owner on the job were left unassigned, so the
-- bell kept asking for an assignee. Match them without moving updated_at
-- (that would replay the catch-up) and without a full old row (that would
-- pop "Lead assigned to you" for every one).
do $$
begin
  alter table public.leads replica identity default;
  alter table public.leads disable trigger user;

  update public.leads l
  set status = 'assigned',
      assigned_to = p.id,
      updated_at = l.updated_at
  from public.opportunities o
  join public.profiles p
    on p.staff_id = o.owner_staff_id
   and p.company_id = o.company_id
  join public.team_members tm
    on tm.id = p.staff_id
   and tm.company_id = o.company_id
   and not tm.locked
  where l.opportunity_id = o.id
    and l.status = 'unassigned'
    and l.assigned_to is null
    and l.passed_back_by is null
    and o.owner_staff_id is not null;

  alter table public.leads enable trigger user;
  alter table public.leads replica identity full;
exception
  when others then
    alter table public.leads enable trigger user;
    alter table public.leads replica identity full;
    raise;
end;
$$;
