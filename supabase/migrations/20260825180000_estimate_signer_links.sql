-- Unique signing links per homeowner, plus a second drawn signature.
-- Opening either link only lets that person sign their own line.
-- When a sent proposal is opened, the contractor is already marked signed.

alter table public.estimates
  add column if not exists second_share_token text not null default '';

alter table public.estimates
  add column if not exists second_signature_name text not null default '';

alter table public.estimates
  add column if not exists second_signature_image text not null default '';

update public.estimates
set second_share_token = replace(gen_random_uuid()::text, '-', '')
where second_contact_id is not null
  and coalesce(second_share_token, '') = '';

update public.estimates
set second_share_token = replace(gen_random_uuid()::text, '-', '')
where second_share_token <> ''
  and second_share_token = share_token;

create unique index if not exists estimates_second_share_token_idx
  on public.estimates (second_share_token)
  where second_share_token <> '';

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
  second_name text;
  customer_name text;
  work_market text;
  v_token text;
  v_role text;
  v_owner text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);
  select * into est
  from public.estimates
  where share_token = v_token
     or (second_share_token <> '' and second_share_token = v_token)
  limit 1;
  if not found then
    return null;
  end if;

  if est.second_contact_id is not null
     and est.second_share_token <> ''
     and est.second_share_token = v_token
     and est.share_token is distinct from v_token then
    v_role := 'second';
  else
    v_role := 'primary';
  end if;

  if est.status = 'sent' then
    update public.estimates set status = 'viewed' where id = est.id;
    est.status := 'viewed';
  end if;

  if est.status in ('sent', 'viewed', 'accepted')
     and (est.owner_signed_at is null or coalesce(est.owner_signed_name, '') = '') then
    v_owner := coalesce(
      nullif(est.owner_signed_name, ''),
      (
        select tm.name
        from public.jobs j
        join public.team_members tm on tm.id = j.owner_staff_id
        where j.id = est.job_id
        limit 1
      ),
      (
        select tm.name
        from public.opportunities o
        join public.team_members tm on tm.id = o.owner_staff_id
        where o.id = est.opportunity_id
        limit 1
      ),
      (select c.name from public.companies c where c.id = est.company_id),
      'Contractor'
    );
    update public.estimates
    set
      owner_signed_at = coalesce(owner_signed_at, sent_at, now()),
      owner_signed_name = coalesce(nullif(owner_signed_name, ''), v_owner)
    where id = est.id
    returning * into est;
  end if;

  select * into company from public.companies where id = est.company_id;
  select name into contact_name from public.contacts where id = est.contact_id;
  select name into second_name from public.contacts where id = est.second_contact_id;
  customer_name := coalesce(contact_name, 'Homeowner');
  if second_name is not null and second_name <> '' and second_name is distinct from contact_name then
    customer_name := customer_name || ' and ' || second_name;
  end if;
  select coalesce(
    (select nullif(j.market, '') from public.jobs j where j.id = est.job_id),
    (select nullif(o.market, '') from public.opportunities o where o.id = est.opportunity_id),
    'residential'
  ) into work_market;
  return jsonb_build_object(
    'customer', customer_name,
    'primaryCustomer', coalesce(contact_name, 'Homeowner'),
    'secondCustomer', second_name,
    'viewerSigner', v_role,
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
    'projectManager', public.document_project_manager(est.company_id, est.job_id, est.opportunity_id),
    'estimate', jsonb_build_object(
      'id', est.id,
      'number', est.number,
      'name', est.name,
      'clientId', est.client_id,
      'opportunityId', est.opportunity_id,
      'jobId', est.job_id,
      'contactId', est.contact_id,
      'secondContactId', est.second_contact_id,
      'status', est.status,
      'notes', '',
      'validUntil', est.valid_until,
      'sentAt', est.sent_at,
      'acceptedAt', est.accepted_at,
      'secondAcceptedAt', est.second_accepted_at,
      'ownerSignedAt', est.owner_signed_at,
      'ownerSignedName', est.owner_signed_name,
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
      'secondShareToken', est.second_share_token,
      'signatureName', coalesce(est.signature_name, ''),
      'signatureImage', coalesce(est.signature_image, ''),
      'secondSignatureName', coalesce(est.second_signature_name, ''),
      'secondSignatureImage', coalesce(est.second_signature_image, '')
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
  v_job_id uuid;
  v_total numeric(14, 2);
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_taxable numeric(14, 2);
  v_code text;
  v_name text;
  v_token text;
  v_role text;
  v_needs_second boolean;
  v_fully boolean;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);

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
  where share_token = v_token
     or (second_share_token <> '' and second_share_token = v_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status = 'declined' then
    return null;
  end if;

  if est.second_contact_id is not null
     and est.second_share_token <> ''
     and est.second_share_token = v_token
     and est.share_token is distinct from v_token then
    v_role := 'second';
  else
    v_role := 'primary';
  end if;

  v_needs_second := est.second_contact_id is not null;

  if v_role = 'second' and not v_needs_second then
    raise exception 'This proposal does not need a second signature';
  end if;

  if v_role = 'primary' and coalesce(est.signature_image, '') <> '' then
    return public.shared_estimate(v_token);
  end if;
  if v_role = 'second' and coalesce(est.second_signature_image, '') <> '' then
    return public.shared_estimate(v_token);
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

  if v_role = 'second' then
    update public.estimates
    set
      second_accepted_at = coalesce(second_accepted_at, now()),
      second_signature_name = v_name,
      second_signature_image = p_signature
    where id = est.id
    returning * into est;
  else
    update public.estimates
    set
      accepted_at = coalesce(accepted_at, now()),
      signature_name = v_name,
      signature_image = p_signature
    where id = est.id
    returning * into est;
  end if;

  v_fully := (coalesce(est.signature_image, '') <> '' or est.accepted_at is not null)
    and (
      not v_needs_second
      or coalesce(est.second_signature_image, '') <> ''
      or est.second_accepted_at is not null
    );

  if not v_fully then
    return public.shared_estimate(v_token);
  end if;

  update public.estimates
  set status = 'accepted'
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

  select j.id into v_job_id
  from public.jobs j
  where j.opportunity_id = opp.id
  limit 1;

  if v_job_id is null then
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
    returning id into v_job_id;
  else
    update public.jobs
    set contract_value = v_total
    where id = v_job_id;
  end if;

  if v_job_id is not null then
    update public.estimates set job_id = v_job_id where id = est.id;
  end if;

  return public.shared_estimate(v_token);
end;
$$;

create or replace function public.select_shared_estimate_line(
  p_token text,
  p_line_id uuid,
  p_selected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  v_token text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  if p_line_id is null then
    raise exception 'Line is required';
  end if;
  v_token := trim(p_token);

  select * into est
  from public.estimates
  where share_token = v_token
     or (second_share_token <> '' and second_share_token = v_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status not in ('draft', 'sent', 'viewed') then
    return public.shared_estimate(v_token);
  end if;

  update public.estimate_lines
  set selected = coalesce(p_selected, true)
  where id = p_line_id
    and estimate_id = est.id
    and coalesce(optional, false) = true;

  return public.shared_estimate(v_token);
end;
$$;

revoke all on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;
revoke all on function public.sign_shared_estimate(text, text, text) from public;
grant execute on function public.sign_shared_estimate(text, text, text) to anon, authenticated;
revoke all on function public.select_shared_estimate_line(text, uuid, boolean) from public;
grant execute on function public.select_shared_estimate_line(text, uuid, boolean) to anon, authenticated;
