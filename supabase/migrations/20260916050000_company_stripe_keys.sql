-- Per-company Stripe keys. Once saved they lock. Removal waits 24 hours
-- and is meant to be emailed to every company admin.

create table if not exists public.company_stripe_accounts (
  company_id uuid primary key references public.companies (id) on delete cascade,
  secret_key text not null default '',
  webhook_secret text not null default '',
  connected_at timestamptz,
  revoke_at timestamptz,
  revoke_requested_at timestamptz,
  revoke_requested_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_stripe_accounts enable row level security;

revoke all on table public.company_stripe_accounts from public, anon, authenticated;

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
    connected_at = null,
    revoke_at = null,
    revoke_requested_at = null,
    revoke_requested_by = '',
    updated_at = now()
  where revoke_at is not null
    and revoke_at <= now();
$$;

create or replace function public.stripe_admin_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.company_id
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.role = 'company_admin'
  limit 1;
$$;

create or replace function public.stripe_company_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  acct public.company_stripe_accounts%rowtype;
begin
  perform public.stripe_apply_company_revokes();
  v_company := public.stripe_admin_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'Only a company admin can manage Stripe keys.');
  end if;
  select * into acct from public.company_stripe_accounts where company_id = v_company;
  return jsonb_build_object(
    'ok', true,
    'connected', acct.company_id is not null and acct.secret_key <> '',
    'revokeAt', acct.revoke_at,
    'revokeRequestedBy', coalesce(acct.revoke_requested_by, ''),
    'connectedAt', acct.connected_at
  );
end;
$$;

create or replace function public.stripe_company_set_keys(p_secret_key text, p_webhook_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  acct public.company_stripe_accounts%rowtype;
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

  insert into public.company_stripe_accounts (
    company_id, secret_key, webhook_secret, connected_at, revoke_at, revoke_requested_at, revoke_requested_by, updated_at
  ) values (
    v_company, trim(p_secret_key), trim(p_webhook_secret), now(), null, null, '', now()
  )
  on conflict (company_id) do update
  set
    secret_key = excluded.secret_key,
    webhook_secret = excluded.webhook_secret,
    connected_at = now(),
    revoke_at = null,
    revoke_requested_at = null,
    revoke_requested_by = '',
    updated_at = now();

  return jsonb_build_object('ok', true, 'connected', true);
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
    'revokeRequestedBy', coalesce(nullif(trim(p_requested_by), ''), 'A company admin')
  );
end;
$$;

create or replace function public.stripe_enabled_for_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_company uuid;
begin
  perform public.stripe_apply_company_revokes();
  v_token := trim(coalesce(p_token, ''));
  if length(v_token) < 6 then
    return false;
  end if;
  select inv.company_id into v_company
  from public.invoices inv
  where inv.share_token = v_token
  limit 1;
  if v_company is null then
    select est.company_id into v_company
    from public.estimates est
    where est.share_token = v_token
       or (est.second_share_token <> '' and est.second_share_token = v_token)
    limit 1;
  end if;
  if v_company is null then
    return false;
  end if;
  return exists (
    select 1
    from public.company_stripe_accounts acct
    where acct.company_id = v_company
      and acct.secret_key <> ''
      and (acct.revoke_at is null or acct.revoke_at > now())
  );
end;
$$;

create or replace function public.stripe_secret_for_token(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_company uuid;
  v_secret text;
begin
  perform public.stripe_apply_company_revokes();
  v_token := trim(coalesce(p_token, ''));
  if length(v_token) < 6 then
    return '';
  end if;
  select inv.company_id into v_company
  from public.invoices inv
  where inv.share_token = v_token
  limit 1;
  if v_company is null then
    select est.company_id into v_company
    from public.estimates est
    where est.share_token = v_token
       or (est.second_share_token <> '' and est.second_share_token = v_token)
    limit 1;
  end if;
  if v_company is null then
    return '';
  end if;
  select acct.secret_key into v_secret
  from public.company_stripe_accounts acct
  where acct.company_id = v_company
    and acct.secret_key <> ''
    and (acct.revoke_at is null or acct.revoke_at > now());
  return coalesce(v_secret, '');
end;
$$;

create or replace function public.stripe_match_webhook(p_payload text, p_header text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ts text;
  v_signed text;
  v_age numeric;
  acct public.company_stripe_accounts%rowtype;
  v_expected text;
  v_sig text;
begin
  perform public.stripe_apply_company_revokes();
  if p_payload is null or p_header is null then
    return jsonb_build_object('ok', false);
  end if;
  v_ts := nullif(substring(p_header from 't=([0-9]+)'), '');
  if v_ts is null then
    return jsonb_build_object('ok', false);
  end if;
  v_age := abs(extract(epoch from now()) - v_ts::numeric);
  if v_age > 300 then
    return jsonb_build_object('ok', false);
  end if;
  v_signed := v_ts || '.' || p_payload;

  for acct in
    select * from public.company_stripe_accounts
    where webhook_secret <> ''
      and secret_key <> ''
      and (revoke_at is null or revoke_at > now())
  loop
    v_expected := encode(hmac(v_signed, acct.webhook_secret, 'sha256'), 'hex');
    foreach v_sig in array regexp_split_to_array(p_header, ',')
    loop
      if trim(v_sig) like 'v1=%' and lower(substr(trim(v_sig), 4)) = v_expected then
        return jsonb_build_object('ok', true, 'companyId', acct.company_id);
      end if;
    end loop;
  end loop;
  return jsonb_build_object('ok', false);
end;
$$;

revoke all on function public.stripe_apply_company_revokes() from public;
grant execute on function public.stripe_apply_company_revokes() to anon, authenticated;
revoke all on function public.stripe_admin_company_id() from public;
grant execute on function public.stripe_admin_company_id() to authenticated;
revoke all on function public.stripe_company_status() from public;
grant execute on function public.stripe_company_status() to authenticated;
revoke all on function public.stripe_company_set_keys(text, text) from public;
grant execute on function public.stripe_company_set_keys(text, text) to authenticated;
revoke all on function public.stripe_company_request_revoke(text) from public;
grant execute on function public.stripe_company_request_revoke(text) to authenticated;
revoke all on function public.stripe_enabled_for_token(text) from public;
grant execute on function public.stripe_enabled_for_token(text) to anon, authenticated;
revoke all on function public.stripe_secret_for_token(text) from public;
grant execute on function public.stripe_secret_for_token(text) to anon, authenticated;
revoke all on function public.stripe_match_webhook(text, text) from public;
grant execute on function public.stripe_match_webhook(text, text) to anon, authenticated;
