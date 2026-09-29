-- Include the client's phone and email on shared proposals so Prepared for
-- matches the office copy.
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
  contact_phone text;
  contact_email text;
  second_name text;
  second_phone text;
  second_email text;
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
  select c.name, c.phone, c.email
    into contact_name, contact_phone, contact_email
  from public.contacts c
  where c.id = coalesce(
    est.contact_id,
    (select j.primary_contact_id from public.jobs j where j.id = est.job_id),
    (select o.primary_contact_id from public.opportunities o where o.id = est.opportunity_id)
  );
  select c.name, c.phone, c.email
    into second_name, second_phone, second_email
  from public.contacts c
  where c.id = est.second_contact_id;
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
    'customerPhone', coalesce(contact_phone, ''),
    'customerEmail', coalesce(contact_email, ''),
    'primaryCustomer', coalesce(contact_name, 'Homeowner'),
    'secondCustomer', second_name,
    'secondCustomerPhone', coalesce(second_phone, ''),
    'secondCustomerEmail', coalesce(second_email, ''),
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

revoke all on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;
