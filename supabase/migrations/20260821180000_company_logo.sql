-- Company logo on estimates, invoices, photo reports, and client share links.

alter table public.companies
  add column if not exists logo_url text not null default '',
  add column if not exists logo_storage_path text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "public read company assets" on storage.objects;
create policy "public read company assets"
on storage.objects for select
to public
using (bucket_id = 'company-assets');

drop policy if exists "company asset files" on storage.objects;
create policy "company asset files"
on storage.objects for all to authenticated
using (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

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
      'licenseNumber', coalesce(company.license_number, ''),
      'logoUrl', coalesce(company.logo_url, '')
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
