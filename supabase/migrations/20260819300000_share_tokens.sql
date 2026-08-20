-- Client share links for estimates and invoices.

alter table public.estimates
  add column if not exists share_token text not null default '';

alter table public.invoices
  add column if not exists share_token text not null default '';

update public.estimates
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token = '';

update public.invoices
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token = '';

create unique index if not exists estimates_share_token_idx
  on public.estimates (share_token)
  where share_token <> '';

create unique index if not exists invoices_share_token_idx
  on public.invoices (share_token)
  where share_token <> '';

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
      'licenseNumber', coalesce(company.license_number, '')
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
      'taxRate', est.tax_rate,
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
      'shareToken', est.share_token
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
      'licenseNumber', coalesce(company.license_number, '')
    ),
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

revoke all on function public.shared_estimate(text) from public;
revoke all on function public.shared_invoice(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;
grant execute on function public.shared_invoice(text) to anon, authenticated;
