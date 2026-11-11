-- Proposal-opened email needs the property, amount, logo, and open count
-- alongside the project manager the earlier function already returns.

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
  v_street text;
  v_city text;
  v_state text;
  v_postal text;
  v_market text;
  v_open_count integer;
  v_viewer_tz text;
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

  v_street := nullif(trim(coalesce(est.street, v_job.street, v_opp.street, '')), '');
  v_city := nullif(trim(coalesce(est.city, v_job.city, v_opp.city, '')), '');
  v_state := nullif(trim(coalesce(est.state, v_job.state, v_opp.state, '')), '');
  v_postal := nullif(trim(coalesce(est.postal_code, v_job.postal_code, v_opp.postal_code, '')), '');
  v_address := trim(both ' ' from concat_ws(', ',
    v_street,
    nullif(trim(concat_ws(' ', v_city, v_state)), ''),
    v_postal
  ));
  v_market := coalesce(
    nullif(trim(coalesce(v_job.market, '')), ''),
    nullif(trim(coalesce(v_opp.market, '')), ''),
    'residential'
  );

  select count(*)::integer,
         coalesce((array_agg(e.time_zone order by e.created_at desc))[1], '')
    into v_open_count, v_viewer_tz
  from public.estimate_signature_events e
  where e.estimate_id = est.id
    and e.kind = 'opened';

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
      'estimateId', est.id,
      'estimateNumber', coalesce(est.number, ''),
      'estimateName', coalesce(est.name, ''),
      'jobId', v_job.id,
      'jobCode', coalesce(v_job.code, ''),
      'address', coalesce(v_address, ''),
      'street', coalesce(v_street, ''),
      'city', coalesce(v_city, ''),
      'state', coalesce(v_state, ''),
      'postalCode', coalesce(v_postal, ''),
      'contactName', coalesce(v_contact_name, ''),
      'companyName', coalesce(v_company.name, ''),
      'companyEmail', coalesce(v_company.email, ''),
      'companyPhone', coalesce(v_company.phone, ''),
      'companyId', est.company_id,
      'companyLogoUrl', coalesce(v_company.logo_url, ''),
      'companyLogoStoragePath', coalesce(v_company.logo_storage_path, ''),
      'cardLogoUrl', coalesce(v_company.card_logo_url, ''),
      'cardLogoStoragePath', coalesce(v_company.card_logo_storage_path, ''),
      'staffTimeZone', coalesce(v_pm.time_zone, ''),
      'viewerTimeZone', coalesce(v_viewer_tz, ''),
      'openedAt', now(),
      'openCount', coalesce(v_open_count, 0),
      'market', v_market,
      'taxRate', coalesce(est.tax_rate, 0),
      'discountKind', coalesce(est.discount_kind, 'percent'),
      'discountValue', coalesce(est.discount_value, 0),
      'marginPercent', coalesce(est.margin_percent, 0),
      'subtotalOverride', est.subtotal_override,
      'packageMode', coalesce(est.package_mode, ''),
      'selectedPackage', coalesce(est.selected_package, ''),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'quantity', line.quantity,
          'unitCost', line.unit_cost,
          'optional', line.optional,
          'selected', line.selected,
          'taxable', line.taxable,
          'package', coalesce(line.package, ''),
          'groupName', coalesce(line.group_name, '')
        ) order by line.sort_order)
        from public.estimate_lines line
        where line.estimate_id = est.id
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.log_estimate_opened(text) from public;
grant execute on function public.log_estimate_opened(text) to anon, authenticated;

notify pgrst, 'reload schema';
