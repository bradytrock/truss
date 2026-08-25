-- When a homeowner opens an expired or broken share link, still name the
-- contractor who sent it and give them a phone and email to reach.
-- Also keep shared estimates from 404-ing if project-manager lookup fails.

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
exception when others then
  return null;
end;
$$;

revoke all on function public.document_project_manager(uuid, uuid, uuid) from public;

create or replace function public.shared_link_sender(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text;
  v_company_id uuid;
  v_job_id uuid;
  v_opp_id uuid;
  company public.companies%rowtype;
  pm jsonb;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);

  select company_id, job_id, opportunity_id
    into v_company_id, v_job_id, v_opp_id
  from public.estimates
  where share_token = v_token
  limit 1;

  if v_company_id is null then
    begin
      execute $q$
        select company_id, job_id, opportunity_id
        from public.estimates
        where second_share_token <> '' and second_share_token = $1
        limit 1
      $q$ into v_company_id, v_job_id, v_opp_id using v_token;
    exception when undefined_column then
      null;
    end;
  end if;

  if v_company_id is null then
    select i.company_id, i.job_id, e.opportunity_id
      into v_company_id, v_job_id, v_opp_id
    from public.invoices i
    left join public.estimates e on e.id = i.estimate_id
    where i.share_token = v_token
    limit 1;
  end if;

  if v_company_id is null then
    begin
      select pr.company_id, pr.job_id, j.opportunity_id
        into v_company_id, v_job_id, v_opp_id
      from public.photo_reports pr
      left join public.jobs j on j.id = pr.job_id
      where pr.share_token = v_token
      limit 1;
    exception when undefined_table then
      null;
    end;
  end if;

  if v_company_id is null then
    return null;
  end if;

  select * into company from public.companies where id = v_company_id;
  if not found then
    return null;
  end if;

  begin
    pm := public.document_project_manager(v_company_id, v_job_id, v_opp_id);
  exception when others then
    pm := null;
  end;

  return jsonb_build_object(
    'company', jsonb_build_object(
      'name', coalesce(nullif(company.name, ''), 'Your contractor'),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, '')
    ),
    'projectManager', pm
  );
end;
$$;

revoke all on function public.shared_link_sender(text) from public;
grant execute on function public.shared_link_sender(text) to anon, authenticated;
