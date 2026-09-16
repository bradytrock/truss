-- Each company gets its own Stripe webhook path so events cannot land
-- on another office.

alter table public.company_stripe_accounts
  add column if not exists webhook_token text not null default '';

create unique index if not exists company_stripe_accounts_webhook_token_uidx
  on public.company_stripe_accounts (webhook_token)
  where webhook_token <> '';

create or replace function public.stripe_apply_company_revokes()
returns void
language sql
security definer
set search_path = public
as $$
  update public.company_stripe_accounts
  set
    secret_key = '',
    webhook_secret = '',
    webhook_token = '',
    connected_at = null,
    revoke_at = null,
    revoke_requested_at = null,
    revoke_requested_by = '',
    updated_at = now()
  where revoke_at is not null
    and revoke_at <= now();
$$;

create or replace function public.stripe_company_status()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company uuid;
  acct public.company_stripe_accounts%rowtype;
  v_token text;
begin
  perform public.stripe_apply_company_revokes();
  v_company := public.stripe_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can manage Stripe keys.');
  end if;

  select * into acct from public.company_stripe_accounts where company_id = v_company;
  if not found then
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into public.company_stripe_accounts (company_id, webhook_token)
    values (v_company, v_token)
    returning * into acct;
  elsif acct.webhook_token = '' then
    v_token := encode(gen_random_bytes(24), 'hex');
    update public.company_stripe_accounts
    set webhook_token = v_token, updated_at = now()
    where company_id = v_company
    returning * into acct;
  end if;

  return jsonb_build_object(
    'ok', true,
    'connected', acct.secret_key <> '',
    'revokeAt', acct.revoke_at,
    'revokeRequestedBy', coalesce(acct.revoke_requested_by, ''),
    'connectedAt', acct.connected_at,
    'webhookToken', acct.webhook_token
  );
end;
$$;

create or replace function public.stripe_company_set_keys(p_secret_key text, p_webhook_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company uuid;
  acct public.company_stripe_accounts%rowtype;
  v_token text;
begin
  perform public.stripe_apply_company_revokes();
  v_company := public.stripe_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can connect Stripe.');
  end if;
  select * into acct from public.company_stripe_accounts where company_id = v_company;
  if acct.company_id is not null and acct.secret_key <> '' then
    return jsonb_build_object('ok', false, 'error', 'Stripe keys are locked. Request removal to change them.');
  end if;
  if coalesce(trim(p_secret_key), '') = '' or coalesce(trim(p_webhook_secret), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Secret key and webhook signing secret are required.');
  end if;

  v_token := coalesce(nullif(acct.webhook_token, ''), encode(gen_random_bytes(24), 'hex'));

  insert into public.company_stripe_accounts (
    company_id, secret_key, webhook_secret, webhook_token, connected_at, revoke_at, revoke_requested_at, revoke_requested_by, updated_at
  ) values (
    v_company, trim(p_secret_key), trim(p_webhook_secret), v_token, now(), null, null, '', now()
  )
  on conflict (company_id) do update
  set
    secret_key = excluded.secret_key,
    webhook_secret = excluded.webhook_secret,
    webhook_token = excluded.webhook_token,
    connected_at = now(),
    revoke_at = null,
    revoke_requested_at = null,
    revoke_requested_by = '',
    updated_at = now();

  return jsonb_build_object('ok', true, 'connected', true, 'webhookToken', v_token);
end;
$$;

create or replace function public.stripe_company_request_revoke(p_requested_by text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  acct public.company_stripe_accounts%rowtype;
  v_when timestamptz;
begin
  perform public.stripe_apply_company_revokes();
  v_company := public.stripe_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can remove Stripe keys.');
  end if;
  select * into acct from public.company_stripe_accounts where company_id = v_company;
  if acct.company_id is null or acct.secret_key = '' then
    return jsonb_build_object('ok', false, 'error', 'Stripe is not connected.');
  end if;
  if acct.revoke_at is not null and acct.revoke_at > now() then
    return jsonb_build_object(
      'ok', true,
      'revokeAt', acct.revoke_at,
      'revokeRequestedBy', acct.revoke_requested_by,
      'webhookToken', acct.webhook_token,
      'alreadyPending', true
    );
  end if;

  v_when := now() + interval '24 hours';
  update public.company_stripe_accounts
  set
    revoke_at = v_when,
    revoke_requested_at = now(),
    revoke_requested_by = coalesce(nullif(trim(p_requested_by), ''), 'A company admin'),
    updated_at = now()
  where company_id = v_company;

  return jsonb_build_object(
    'ok', true,
    'revokeAt', v_when,
    'revokeRequestedBy', coalesce(nullif(trim(p_requested_by), ''), 'A company admin'),
    'webhookToken', acct.webhook_token
  );
end;
$$;

create or replace function public.stripe_verify_company_webhook(
  p_token text,
  p_payload text,
  p_header text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  acct public.company_stripe_accounts%rowtype;
  v_ts text;
  v_signed text;
  v_age numeric;
  v_expected text;
  v_sig text;
begin
  perform public.stripe_apply_company_revokes();
  v_token := trim(coalesce(p_token, ''));
  if length(v_token) < 24 then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;
  select * into acct
  from public.company_stripe_accounts
  where webhook_token = v_token
    and secret_key <> ''
    and webhook_secret <> ''
    and (revoke_at is null or revoke_at > now())
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  if p_payload is null or p_header is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_signature');
  end if;
  v_ts := nullif(substring(p_header from 't=([0-9]+)'), '');
  if v_ts is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_signature');
  end if;
  v_age := abs(extract(epoch from now()) - v_ts::numeric);
  if v_age > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_signature');
  end if;
  v_signed := v_ts || '.' || p_payload;
  v_expected := encode(hmac(v_signed, acct.webhook_secret, 'sha256'), 'hex');
  foreach v_sig in array regexp_split_to_array(p_header, ',')
  loop
    if trim(v_sig) like 'v1=%' and lower(substr(trim(v_sig), 4)) = v_expected then
      return jsonb_build_object('ok', true, 'companyId', acct.company_id);
    end if;
  end loop;
  return jsonb_build_object('ok', false, 'error', 'invalid_signature');
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
  if p_company_id is null then
    return jsonb_build_object('ok', false, 'error', 'company_required');
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
    if v_invoice.company_id is distinct from p_company_id then
      return jsonb_build_object('ok', false, 'error', 'company_mismatch');
    end if;
    v_job_id := coalesce(v_job_id, v_invoice.job_id);
  end if;

  if p_estimate_id is not null then
    select * into v_estimate from public.estimates where id = p_estimate_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'estimate_not_found');
    end if;
    if v_estimate.company_id is distinct from p_company_id then
      return jsonb_build_object('ok', false, 'error', 'company_mismatch');
    end if;
    v_job_id := coalesce(v_job_id, v_estimate.job_id);
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

revoke all on function public.stripe_verify_company_webhook(text, text, text) from public;
grant execute on function public.stripe_verify_company_webhook(text, text, text) to anon, authenticated;
revoke all on function public.stripe_company_status() from public;
grant execute on function public.stripe_company_status() to authenticated;
revoke all on function public.stripe_company_set_keys(text, text) from public;
grant execute on function public.stripe_company_set_keys(text, text) to authenticated;
revoke all on function public.stripe_company_request_revoke(text) from public;
grant execute on function public.stripe_company_request_revoke(text) to authenticated;
revoke all on function public.stripe_record_pending_payment(uuid, uuid, uuid, uuid, numeric, timestamptz, text, text, text) from public;
grant execute on function public.stripe_record_pending_payment(uuid, uuid, uuid, uuid, numeric, timestamptz, text, text, text) to anon, authenticated;
