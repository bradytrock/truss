-- Card payments from Stripe start pending. Accounting matches Stripe, then
-- posts them as a job deposit. Share links show every way to pay.

alter table public.payments
  add column if not exists estimate_id uuid references public.estimates (id) on delete set null,
  add column if not exists posting_status text not null default 'posted',
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by text not null default '',
  add column if not exists stripe_payment_intent_id text not null default '',
  add column if not exists stripe_checkout_session_id text not null default '';

alter table public.payments drop constraint if exists payments_posting_status_check;
alter table public.payments
  add constraint payments_posting_status_check
  check (posting_status in ('pending', 'posted', 'rejected'));

update public.payments
set posting_status = 'posted'
where posting_status is null or posting_status = '';

create index if not exists payments_estimate_id_idx on public.payments (estimate_id);
create index if not exists payments_posting_status_idx on public.payments (company_id, posting_status);

create unique index if not exists payments_stripe_payment_intent_uidx
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id <> '';

create unique index if not exists payments_stripe_checkout_session_uidx
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id <> '';

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
      'slug', coalesce(company.slug, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'street', coalesce(company.street, ''),
      'city', coalesce(company.city, ''),
      'state', coalesce(company.state, ''),
      'postalCode', coalesce(company.postal_code, ''),
      'licenseNumber', coalesce(company.license_number, ''),
      'logoUrl', coalesce(company.logo_url, ''),
      'paymentVenmo', coalesce(company.payment_venmo, ''),
      'paymentZelle', coalesce(company.payment_zelle, ''),
      'paymentCashapp', coalesce(company.payment_cashapp, ''),
      'paymentPaypal', coalesce(company.payment_paypal, ''),
      'paymentNote', coalesce(company.payment_note, '')
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
      'notes', coalesce(inv.notes, ''),
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
        'jobId', payment.job_id,
        'estimateId', payment.estimate_id,
        'amount', payment.amount,
        'method', payment.method,
        'paidAt', payment.paid_at,
        'reference', payment.reference,
        'postingStatus', payment.posting_status
      ) order by payment.paid_at)
      from public.payments payment
      where payment.invoice_id = inv.id
        and payment.posting_status in ('pending', 'posted')
    ), '[]'::jsonb)
  );
end;
$$;

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
      'slug', coalesce(company.slug, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'street', coalesce(company.street, ''),
      'city', coalesce(company.city, ''),
      'state', coalesce(company.state, ''),
      'postalCode', coalesce(company.postal_code, ''),
      'licenseNumber', coalesce(company.license_number, ''),
      'logoUrl', coalesce(company.logo_url, ''),
      'paymentVenmo', coalesce(company.payment_venmo, ''),
      'paymentZelle', coalesce(company.payment_zelle, ''),
      'paymentCashapp', coalesce(company.payment_cashapp, ''),
      'paymentPaypal', coalesce(company.payment_paypal, ''),
      'paymentNote', coalesce(company.payment_note, '')
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
      'notes', coalesce(est.notes, ''),
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
      'marginPercent', coalesce(est.margin_percent, 0),
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
      'secondSignatureImage', coalesce(est.second_signature_image, ''),
      'subtotalOverride', est.subtotal_override,
      'hideLinePrices', coalesce(est.hide_line_prices, false),
      'packageMode', coalesce(est.package_mode, ''),
      'selectedPackage', coalesce(est.selected_package, 'better')
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
        'taxable', line.taxable,
        'package', coalesce(line.package, ''),
        'photoIds', coalesce(line.photo_ids, '{}'::uuid[]),
        'photos', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id', photo.id,
              'imageUrl', photo.image_url,
              'caption', coalesce(photo.caption, '')
            ) order by ord.ord
          ), '[]'::jsonb)
          from unnest(coalesce(line.photo_ids, '{}'::uuid[])) with ordinality as ord(id, ord)
          join public.job_photos photo on photo.id = ord.id
        )
      ) order by line.sort_order)
      from public.estimate_lines line
      where line.estimate_id = est.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', payment.id,
        'invoiceId', payment.invoice_id,
        'jobId', payment.job_id,
        'estimateId', payment.estimate_id,
        'amount', payment.amount,
        'method', payment.method,
        'paidAt', payment.paid_at,
        'reference', payment.reference,
        'postingStatus', payment.posting_status
      ) order by payment.paid_at)
      from public.payments payment
      where payment.estimate_id = est.id
        and payment.posting_status in ('pending', 'posted')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.stripe_open_balance(
  p_token text,
  p_kind text,
  p_deposit_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_kind text;
  inv public.invoices%rowtype;
  est public.estimates%rowtype;
  v_total numeric(14, 2);
  v_posted numeric(14, 2);
  v_pending numeric(14, 2);
  v_collected numeric(14, 2);
  v_amount numeric(14, 2);
  v_customer text;
begin
  v_token := trim(coalesce(p_token, ''));
  v_kind := lower(trim(coalesce(p_kind, '')));
  if length(v_token) < 6 then
    return jsonb_build_object('ok', false, 'error', 'That payment link is not valid.');
  end if;

  if v_kind = 'invoice' then
    select * into inv from public.invoices where share_token = v_token limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Invoice not found.');
    end if;
    if inv.status in ('draft', 'void') then
      return jsonb_build_object('ok', false, 'error', 'This invoice cannot be paid yet.');
    end if;
    select coalesce(sum(line.quantity * line.unit_cost), 0) into v_total
    from public.invoice_lines line
    where line.invoice_id = inv.id;
    select coalesce(sum(payment.amount), 0) into v_posted
    from public.payments payment
    where payment.invoice_id = inv.id
      and payment.posting_status = 'posted';
    select coalesce(sum(payment.amount), 0) into v_pending
    from public.payments payment
    where payment.invoice_id = inv.id
      and payment.posting_status = 'pending';
    v_amount := round(greatest(0, v_total - v_posted - v_pending), 2);
    select c.name into v_customer
    from public.jobs j
    join public.contacts c on c.id = j.primary_contact_id
    where j.id = inv.job_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'invoice',
      'companyId', inv.company_id,
      'invoiceId', inv.id,
      'estimateId', inv.estimate_id,
      'jobId', inv.job_id,
      'amount', v_amount,
      'label', concat('Invoice ', inv.number),
      'customer', coalesce(v_customer, inv.name, 'Homeowner'),
      'sharePath', concat('/share/i/', inv.share_token)
    );
  end if;

  if v_kind = 'deposit' then
    select * into est
    from public.estimates
    where share_token = v_token
       or (second_share_token <> '' and second_share_token = v_token)
    limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Proposal not found.');
    end if;
    if est.status <> 'accepted' then
      return jsonb_build_object('ok', false, 'error', 'Sign the proposal before paying a deposit.');
    end if;
    select coalesce(sum(payment.amount), 0) into v_collected
    from public.payments payment
    where payment.estimate_id = est.id
      and payment.posting_status in ('pending', 'posted');
    v_amount := round(greatest(0, coalesce(p_deposit_amount, 0) - v_collected), 2);
    select name into v_customer from public.contacts where id = est.contact_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'deposit',
      'companyId', est.company_id,
      'invoiceId', null,
      'estimateId', est.id,
      'jobId', est.job_id,
      'amount', v_amount,
      'label', concat('Deposit · ', est.number),
      'customer', coalesce(v_customer, est.name, 'Homeowner'),
      'sharePath', concat('/share/e/', v_token)
    );
  end if;

  return jsonb_build_object('ok', false, 'error', 'Choose invoice or deposit.');
end;
$$;

create or replace function public.stripe_record_pending_payment(
  p_company_id uuid,
  p_invoice_id uuid,
  p_estimate_id uuid,
  p_job_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_payment_intent text,
  p_checkout_session text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent text;
  v_session text;
  v_id uuid;
  v_invoice public.invoices%rowtype;
  v_estimate public.estimates%rowtype;
  v_job_id uuid;
  v_company uuid;
begin
  v_intent := trim(coalesce(p_payment_intent, ''));
  v_session := trim(coalesce(p_checkout_session, ''));
  if v_intent !~ '^pi_[A-Za-z0-9]+' or v_session !~ '^cs_[A-Za-z0-9]+' then
    return jsonb_build_object('ok', false, 'error', 'invalid_stripe_ids');
  end if;
  if coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select id into v_id from public.payments where stripe_payment_intent_id = v_intent limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
  end if;
  select id into v_id from public.payments where stripe_checkout_session_id = v_session limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
  end if;

  v_company := p_company_id;
  v_job_id := p_job_id;

  if p_invoice_id is not null then
    select * into v_invoice from public.invoices where id = p_invoice_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'invoice_not_found');
    end if;
    v_company := v_invoice.company_id;
    v_job_id := coalesce(v_job_id, v_invoice.job_id);
  end if;

  if p_estimate_id is not null then
    select * into v_estimate from public.estimates where id = p_estimate_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'estimate_not_found');
    end if;
    v_company := v_estimate.company_id;
    v_job_id := coalesce(v_job_id, v_estimate.job_id);
  end if;

  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'company_required');
  end if;
  if p_invoice_id is null and p_estimate_id is null and v_job_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_target');
  end if;

  insert into public.payments (
    company_id,
    invoice_id,
    job_id,
    estimate_id,
    amount,
    method,
    paid_at,
    reference,
    receipt_url,
    receipt_storage_path,
    qb_status,
    created_by,
    posting_status,
    stripe_payment_intent_id,
    stripe_checkout_session_id
  ) values (
    v_company,
    p_invoice_id,
    v_job_id,
    p_estimate_id,
    round(p_amount, 2),
    'card',
    coalesce(p_paid_at, now()),
    coalesce(nullif(trim(p_reference), ''), v_intent),
    '',
    null,
    'not_in_qb',
    'stripe',
    'pending',
    v_intent,
    v_session
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.shared_invoice(text) from public;
grant execute on function public.shared_invoice(text) to anon, authenticated;
revoke all on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;
revoke all on function public.stripe_open_balance(text, text, numeric) from public;
grant execute on function public.stripe_open_balance(text, text, numeric) to anon, authenticated;
revoke all on function public.stripe_record_pending_payment(uuid, uuid, uuid, uuid, numeric, timestamptz, text, text, text) from public;
grant execute on function public.stripe_record_pending_payment(uuid, uuid, uuid, uuid, numeric, timestamptz, text, text, text) to anon, authenticated;
