-- Homeowner signature on an accepted estimate. Drawn on the share link or in the office,
-- stored on the estimate, and printed on the proposal PDF.

alter table public.estimates
  add column if not exists signature_name text not null default '',
  add column if not exists signature_image text not null default '';

create or replace function public.shared_estimate(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  company public.companies%rowtype;
  contact_name text;
  work_market text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  select * into est
  from public.estimates
  where share_token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status = 'sent' then
    update public.estimates set status = 'viewed' where id = est.id;
    est.status := 'viewed';
  end if;
  select * into company from public.companies where id = est.company_id;
  select name into contact_name from public.contacts where id = est.contact_id;
  select coalesce(
    (select nullif(j.market, '') from public.jobs j where j.id = est.job_id),
    (select nullif(o.market, '') from public.opportunities o where o.id = est.opportunity_id),
    'residential'
  ) into work_market;
  return jsonb_build_object(
    'customer', coalesce(contact_name, 'Homeowner'),
    'market', work_market,
    'company', jsonb_build_object(
      'name', coalesce(company.name, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'street', coalesce(company.street, ''),
      'city', coalesce(company.city, ''),
      'state', coalesce(company.state, ''),
      'postalCode', coalesce(company.postal_code, ''),
      'licenseNumber', coalesce(company.license_number, ''),
      'logoUrl', coalesce(company.logo_url, '')
    ),
    'estimate', jsonb_build_object(
      'id', est.id,
      'number', est.number,
      'name', est.name,
      'clientId', est.client_id,
      'opportunityId', est.opportunity_id,
      'jobId', est.job_id,
      'contactId', est.contact_id,
      'status', est.status,
      'notes', '',
      'validUntil', est.valid_until,
      'sentAt', est.sent_at,
      'acceptedAt', est.accepted_at,
      'createdAt', est.created_at,
      'taxRate', case when work_market = 'commercial' then est.tax_rate else 0 end,
      'discountKind', est.discount_kind,
      'discountValue', est.discount_value,
      'depositKind', est.deposit_kind,
      'depositValue', est.deposit_value,
      'intro', est.intro,
      'terms', est.terms,
      'street', est.street,
      'city', est.city,
      'state', est.state,
      'postalCode', est.postal_code,
      'shareToken', est.share_token,
      'signatureName', coalesce(est.signature_name, ''),
      'signatureImage', coalesce(est.signature_image, '')
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'estimateId', line.estimate_id,
        'catalogItemId', line.catalog_item_id,
        'title', line.title,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'unitCost', line.unit_cost,
        'sortOrder', line.sort_order,
        'groupName', line.group_name,
        'optional', line.optional,
        'selected', line.selected,
        'taxable', line.taxable
      ) order by line.sort_order)
      from public.estimate_lines line
      where line.estimate_id = est.id
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.sign_shared_estimate(text);

create or replace function public.sign_shared_estimate(
  p_token text,
  p_signer_name text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  opp public.opportunities%rowtype;
  job_id uuid;
  v_total numeric(14, 2);
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_taxable numeric(14, 2);
  v_code text;
  v_name text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;

  v_name := trim(coalesce(p_signer_name, ''));
  if length(v_name) < 2 then
    raise exception 'Signer name is required';
  end if;
  if p_signature is null
     or p_signature not like 'data:image/png;base64,%'
     or length(p_signature) < 100
     or length(p_signature) > 200000 then
    raise exception 'A drawn signature is required';
  end if;

  select * into est
  from public.estimates
  where share_token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status = 'declined' then
    return null;
  end if;

  if est.status = 'accepted' and coalesce(est.signature_image, '') <> '' then
    return public.shared_estimate(trim(p_token));
  end if;

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_subtotal
  from public.estimate_lines line
  where line.estimate_id = est.id
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  if coalesce(est.discount_kind, 'percent') = 'percent' then
    v_discount := round(v_subtotal * coalesce(est.discount_value, 0) / 100, 2);
  else
    v_discount := least(v_subtotal, coalesce(est.discount_value, 0));
  end if;
  v_discount := coalesce(v_discount, 0);

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_taxable
  from public.estimate_lines line
  where line.estimate_id = est.id
    and coalesce(line.taxable, true) = true
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  v_total := greatest(0, v_subtotal - v_discount);
  if v_subtotal > 0 then
    v_total := v_total + round(
      greatest(0, v_taxable - v_discount * (v_taxable / v_subtotal)) * coalesce(est.tax_rate, 0) / 100,
      2
    );
  end if;

  update public.estimates
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now()),
    signature_name = v_name,
    signature_image = p_signature
  where id = est.id
  returning * into est;

  if est.opportunity_id is null then
    insert into public.opportunities (
      company_id,
      name,
      client_id,
      primary_contact_id,
      stage,
      value,
      location,
      project_type,
      delivery_method,
      estimator,
      win_probability,
      next_step,
      code
    ) values (
      est.company_id,
      est.name,
      est.client_id,
      est.contact_id,
      'awarded',
      v_total,
      trim(both ', ' from concat_ws(', ', nullif(est.street, ''), nullif(est.city, ''))),
      'restoration',
      'fixed_price',
      '',
      100,
      'Job sold. Start precon.',
      est.number
    )
    returning * into opp;

    update public.estimates
    set opportunity_id = opp.id
    where id = est.id
    returning * into est;
  else
    update public.opportunities
    set
      stage = 'awarded',
      win_probability = 100,
      value = v_total,
      next_step = 'Job sold. Start precon.'
    where id = est.opportunity_id
    returning * into opp;
  end if;

  select j.id into job_id
  from public.jobs j
  where j.opportunity_id = opp.id
  limit 1;

  if job_id is null then
    v_code := coalesce(nullif(opp.code, ''), est.number);
    insert into public.jobs (
      company_id,
      opportunity_id,
      name,
      client_id,
      primary_contact_id,
      status,
      contract_value,
      start_date,
      location,
      project_manager,
      superintendent,
      owner_staff_id,
      code
    ) values (
      est.company_id,
      opp.id,
      opp.name,
      opp.client_id,
      opp.primary_contact_id,
      'precon',
      v_total,
      current_date,
      opp.location,
      coalesce(opp.estimator, ''),
      '',
      opp.owner_staff_id,
      v_code
    )
    returning id into job_id;
  else
    update public.jobs
    set contract_value = v_total
    where id = job_id;
  end if;

  if job_id is not null then
    update public.estimates set job_id = job_id where id = est.id;
  end if;

  return public.shared_estimate(trim(p_token));
end;
$$;

revoke all on function public.sign_shared_estimate(text, text, text) from public;
grant execute on function public.sign_shared_estimate(text, text, text) to anon, authenticated;
