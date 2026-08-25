-- Job owner (project manager) contact on shared estimates and invoices.

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
    'phone', coalesce(company_phone, '')
  );
end;
$$;

revoke all on function public.document_project_manager(uuid, uuid, uuid) from public;

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

create or replace function public.shared_invoice(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  company public.companies%rowtype;
  contact_name text;
  estimate_opp uuid;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  select * into inv
  from public.invoices
  where share_token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  select * into company from public.companies where id = inv.company_id;
  select c.name into contact_name
  from public.jobs j
  join public.contacts c on c.id = j.primary_contact_id
  where j.id = inv.job_id;
  select e.opportunity_id into estimate_opp from public.estimates e where e.id = inv.estimate_id;
  return jsonb_build_object(
    'customer', coalesce(contact_name, 'Homeowner'),
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
    'projectManager', public.document_project_manager(inv.company_id, inv.job_id, estimate_opp),
    'invoice', jsonb_build_object(
      'id', inv.id,
      'number', inv.number,
      'name', inv.name,
      'clientId', inv.client_id,
      'jobId', inv.job_id,
      'estimateId', inv.estimate_id,
      'status', inv.status,
      'issuedAt', inv.issued_at,
      'dueAt', inv.due_at,
      'notes', '',
      'terms', coalesce(inv.terms, ''),
      'shareToken', inv.share_token
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'invoiceId', line.invoice_id,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'unitCost', line.unit_cost,
        'sortOrder', line.sort_order
      ) order by line.sort_order)
      from public.invoice_lines line
      where line.invoice_id = inv.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', payment.id,
        'invoiceId', payment.invoice_id,
        'amount', payment.amount,
        'method', payment.method,
        'paidAt', payment.paid_at,
        'reference', payment.reference
      ) order by payment.paid_at)
      from public.payments payment
      where payment.invoice_id = inv.id
    ), '[]'::jsonb)
  );
end;
$$;
