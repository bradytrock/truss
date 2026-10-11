-- Assigned to on a new lead is the project manager, whatever their seat.
-- A later migration owns the lead-row sync. This trigger only fills a blank
-- project manager from the owner when a job is opened without one.

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
