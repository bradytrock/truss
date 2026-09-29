-- Company email templates: editable copy for every system email.

alter table public.companies
  add column if not exists email_templates jsonb not null default '{}'::jsonb;

comment on column public.companies.email_templates is
  'Per-email subject, headline, message, and button overrides. Empty fields use the built-in wording.';

create or replace function public.company_email_templates(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(email_templates, '{}'::jsonb)
  from public.companies
  where id = p_company_id;
$$;

revoke all on function public.company_email_templates(uuid) from public;
grant execute on function public.company_email_templates(uuid) to anon, authenticated;

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

create or replace function public.log_estimate_opened(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  v_job public.jobs%rowtype;
  v_opp public.opportunities%rowtype;
  v_pm public.team_members%rowtype;
  v_company public.companies%rowtype;
  v_contact_name text;
  v_label text;
  v_body text;
  v_author text;
  v_address text;
  v_entity_type public.entity_kind;
  v_entity_id uuid;
  v_activity_id uuid;
begin
  if length(trim(coalesce(p_token, ''))) < 6 then
    return null;
  end if;

  select * into est
  from public.estimates
  where share_token = trim(p_token)
     or (second_share_token <> '' and second_share_token = trim(p_token))
  limit 1;
  if not found then
    return null;
  end if;

  if est.job_id is not null then
    select * into v_job from public.jobs where id = est.job_id;
  elsif est.opportunity_id is not null then
    select * into v_job
    from public.jobs
    where opportunity_id = est.opportunity_id
    order by created_at desc
    limit 1;
  end if;

  if est.opportunity_id is not null then
    select * into v_opp from public.opportunities where id = est.opportunity_id;
  end if;

  select * into v_company from public.companies where id = est.company_id;

  if v_job.owner_staff_id is not null then
    select * into v_pm from public.team_members where id = v_job.owner_staff_id;
  end if;
  if v_pm.id is null and coalesce(trim(v_job.project_manager), '') <> '' then
    select * into v_pm
    from public.team_members
    where company_id = est.company_id
      and lower(trim(name)) = lower(trim(v_job.project_manager))
    limit 1;
  end if;
  if v_pm.id is null and coalesce(trim(v_job.sales_rep), '') <> '' then
    select * into v_pm
    from public.team_members
    where company_id = est.company_id
      and lower(trim(name)) = lower(trim(v_job.sales_rep))
    limit 1;
  end if;
  if v_pm.id is null and v_opp.owner_staff_id is not null then
    select * into v_pm from public.team_members where id = v_opp.owner_staff_id;
  end if;
  if v_pm.id is null and coalesce(trim(v_opp.estimator), '') <> '' then
    select * into v_pm
    from public.team_members
    where company_id = est.company_id
      and lower(trim(name)) = lower(trim(v_opp.estimator))
    limit 1;
  end if;

  select name into v_contact_name
  from public.contacts
  where id = coalesce(
    case
      when est.second_contact_id is not null
           and est.second_share_token <> ''
           and est.second_share_token = trim(p_token)
           and est.share_token is distinct from trim(p_token)
      then est.second_contact_id
      else est.contact_id
    end,
    est.contact_id
  );

  v_label := coalesce(nullif(trim(est.number), ''), nullif(trim(est.name), ''), 'the proposal');
  v_author := coalesce(nullif(trim(v_contact_name), ''), 'Homeowner');
  v_body := v_author || ' opened proposal ' || v_label || '.';

  v_address := trim(both ' ' from concat_ws(', ',
    nullif(trim(coalesce(est.street, v_job.street, v_opp.street, '')), ''),
    nullif(trim(concat_ws(' ',
      nullif(trim(coalesce(est.city, v_job.city, v_opp.city, '')), ''),
      nullif(trim(coalesce(est.state, v_job.state, v_opp.state, '')), '')
    )), ''),
    nullif(trim(coalesce(est.postal_code, v_job.postal_code, v_opp.postal_code, '')), '')
  ));

  if v_job.id is not null then
    v_entity_type := 'job';
    v_entity_id := v_job.id;
  elsif est.opportunity_id is not null then
    v_entity_type := 'opportunity';
    v_entity_id := est.opportunity_id;
  end if;

  if v_entity_id is not null then
    if not exists (
      select 1
      from public.activities a
      where a.company_id = est.company_id
        and a.entity_type = v_entity_type
        and a.entity_id = v_entity_id
        and a.body = v_body
        and a.created_at > now() - interval '15 minutes'
    ) then
      insert into public.activities (company_id, entity_type, entity_id, type, body, author)
      values (est.company_id, v_entity_type, v_entity_id, 'note', v_body, v_author)
      returning id into v_activity_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'activityId', v_activity_id,
    'notify', jsonb_build_object(
      'staffId', v_pm.id,
      'name', coalesce(v_pm.name, ''),
      'phone', coalesce(v_pm.phone, ''),
      'email', coalesce(v_pm.email, ''),
      'estimateNumber', coalesce(est.number, ''),
      'estimateName', coalesce(est.name, ''),
      'jobCode', coalesce(v_job.code, ''),
      'address', coalesce(v_address, ''),
      'contactName', coalesce(v_contact_name, ''),
      'companyName', coalesce(v_company.name, ''),
      'companyEmail', coalesce(v_company.email, ''),
      'companyId', est.company_id
    )
  );
end;
$$;

revoke all on function public.log_estimate_opened(text) from public;
grant execute on function public.log_estimate_opened(text) to anon, authenticated;

notify pgrst, 'reload schema';
