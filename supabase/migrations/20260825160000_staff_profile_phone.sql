-- Per-seat profile phone so estimates and invoices can print a direct line.
-- Also lets a teammate update their own name, title, and phone.

alter table public.team_members
  add column if not exists phone text not null default '';

drop policy if exists "update own seat profile" on public.team_members;
create policy "update own seat profile" on public.team_members
  for update to authenticated
  using (id = public.current_staff_id() and company_id = public.current_company_id())
  with check (id = public.current_staff_id() and company_id = public.current_company_id());

create or replace function public.protect_team_member_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if public.current_is_company_admin() then
    return new;
  end if;
  new.role := old.role;
  new.locked := old.locked;
  new.restricted := old.restricted;
  new.email := old.email;
  new.invite_expires_at := old.invite_expires_at;
  new.team_id := old.team_id;
  new.company_id := old.company_id;
  return new;
end;
$$;

drop trigger if exists protect_team_member_admin_fields on public.team_members;
create trigger protect_team_member_admin_fields
  before update on public.team_members
  for each row execute function public.protect_team_member_admin_fields();

create or replace function public.document_project_manager(
  p_company_id uuid,
  p_job_id uuid,
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  job public.jobs%rowtype;
  opp public.opportunities%rowtype;
  pm public.team_members%rowtype;
  company_phone text;
  pm_name text;
begin
  if p_job_id is not null then
    select * into job from public.jobs where id = p_job_id;
  end if;
  if coalesce(p_opportunity_id, job.opportunity_id) is not null then
    select * into opp from public.opportunities where id = coalesce(p_opportunity_id, job.opportunity_id);
  end if;
  select phone into company_phone from public.companies where id = p_company_id;

  if coalesce(job.owner_staff_id, opp.owner_staff_id) is not null then
    select * into pm
    from public.team_members
    where id = coalesce(job.owner_staff_id, opp.owner_staff_id);
  end if;
  if pm.id is null then
    select * into pm
    from public.team_members
    where company_id = p_company_id
      and lower(name) = lower(coalesce(nullif(job.project_manager, ''), nullif(job.sales_rep, ''), nullif(opp.estimator, '')))
    limit 1;
  end if;

  pm_name := coalesce(
    nullif(pm.name, ''),
    nullif(job.project_manager, ''),
    nullif(job.sales_rep, ''),
    nullif(opp.estimator, '')
  );
  if pm_name is null or pm_name = '' then
    return null;
  end if;
  return jsonb_build_object(
    'name', pm_name,
    'title', coalesce(nullif(pm.title, ''), 'Project Manager'),
    'email', coalesce(pm.email, ''),
    'phone', coalesce(nullif(pm.phone, ''), company_phone, '')
  );
end;
$$;

revoke all on function public.document_project_manager(uuid, uuid, uuid) from public;
