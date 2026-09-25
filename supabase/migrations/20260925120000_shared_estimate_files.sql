-- Show estimate attachments on the homeowner share link.
-- The proposal payload includes file name, size, and storage location.
-- The estimate share token (or the second homeowner's token) can read those objects only.

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
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attachment.id,
        'name', attachment.name,
        'mimeType', coalesce(attachment.mime_type, ''),
        'sizeBytes', coalesce(attachment.size_bytes, 0),
        'url', coalesce(attachment.url, ''),
        'storagePath', coalesce(attachment.storage_path, ''),
        'createdAt', attachment.created_at
      ) order by attachment.created_at)
      from public.estimate_files attachment
      where attachment.estimate_id = est.id
        and attachment.company_id = est.company_id
    ), '[]'::jsonb)
  );
end;
$$;


revoke all on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;

create or replace function public.storage_share_access(p_token text, p_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := trim(coalesce(p_token, ''));
  path text := trim(both '/' from coalesce(p_path, ''));
  parts text[];
  company_id uuid;
  kind text;
  job_id uuid;
  path_job text;
  file_name text;
  kindless text;
  ok boolean := false;
begin
  if length(token) < 6 or path = '' or position('..' in path) > 0 then
    return false;
  end if;

  parts := string_to_array(path, '/');
  if array_length(parts, 1) < 3 then
    return false;
  end if;

  -- Canonical: {companyId}/{kind}/…
  if parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    company_id := parts[1]::uuid;
    kind := parts[2];
    path_job := parts[3];
  -- Legacy: {kind}/{companyId}/…
  elsif parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    kind := parts[1];
    company_id := parts[2]::uuid;
    path_job := parts[3];
  else
    return false;
  end if;

  if kind = 'company-assets' then
    return true;
  end if;

  -- Estimate share (including the second homeowner link) unlocks that estimate's attachments only.
  if kind = 'estimate-files' then
    if array_length(parts, 1) < 4 then
      return false;
    end if;
    if parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return false;
    end if;
    file_name := parts[array_length(parts, 1)];
    if file_name is null or file_name = '' then
      return false;
    end if;
    kindless := company_id::text || '/' || array_to_string(parts[3:array_length(parts, 1)], '/');
    select true into ok
    from public.estimate_files attachment
    join public.estimates estimate on estimate.id = attachment.estimate_id
    where estimate.company_id = company_id
      and estimate.id = parts[3]::uuid
      and (
        estimate.share_token = token
        or coalesce(estimate.second_share_token, '') = token
      )
      and (
        trim(both '/' from coalesce(attachment.storage_path, '')) = path
        or trim(both '/' from coalesce(attachment.storage_path, '')) = kindless
        or right(
          trim(both '/' from coalesce(attachment.storage_path, '')),
          length(parts[3] || '/' || file_name)
        ) = parts[3] || '/' || file_name
      )
    limit 1;
    return coalesce(ok, false);
  end if;

  if kind not in ('job-files', 'job-photos') then
    return false;
  end if;

  -- Explicit file share: exact storage path.
  select true into ok
  from public.job_files f
  where f.share_token = token
    and f.storage_path = path
  limit 1;
  if coalesce(ok, false) then
    return true;
  end if;

  -- Document share: estimate / invoice / page token unlocks that job's photos & files.
  select e.job_id into job_id
  from public.estimates e
  where e.company_id = company_id
    and (
      e.share_token = token
      or coalesce(e.second_share_token, '') = token
    )
  limit 1;

  if job_id is null then
    select i.job_id into job_id
    from public.invoices i
    where i.company_id = company_id
      and i.share_token = token
    limit 1;
  end if;

  if job_id is null then
    select r.job_id into job_id
    from public.photo_reports r
    where r.company_id = company_id
      and r.share_token = token
    limit 1;
  end if;

  if job_id is null then
    return false;
  end if;

  if path_job = job_id::text then
    return true;
  end if;

  if kind = 'job-photos' then
    file_name := parts[array_length(parts, 1)];
    kindless := company_id::text || '/' || array_to_string(parts[3:array_length(parts, 1)], '/');
    select true into ok
    from public.job_photos p
    where p.job_id = job_id
      and p.deleted_at is null
      and (
        coalesce(p.storage_path, '') = path
        or coalesce(p.storage_path, '') = kindless
        or coalesce(p.image_url, '') ilike '%' || file_name || '%'
      )
    limit 1;
    return coalesce(ok, false);
  end if;

  return false;
end;
$$;

revoke all on function public.storage_share_access(text, text) from public;
grant execute on function public.storage_share_access(text, text) to anon, authenticated;
