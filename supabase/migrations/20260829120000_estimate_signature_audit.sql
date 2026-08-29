-- Append-only signature audit: who signed, which link, IP, user agent,
-- e-sign consent, and a hash of the proposal they approved.

create table if not exists public.estimate_signature_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  kind text not null,
  signer_role text not null default '',
  contact_id uuid references public.contacts (id) on delete set null,
  signer_name text not null default '',
  token_suffix text not null default '',
  token_sha256 text not null default '',
  ip_address text not null default '',
  forwarded_for text not null default '',
  user_agent text not null default '',
  accept_language text not null default '',
  time_zone text not null default '',
  delivery_channel text not null default '',
  delivery_to text not null default '',
  consent_text text not null default '',
  consent_version text not null default '',
  document_sha256 text not null default '',
  document_snapshot jsonb not null default '{}'::jsonb,
  captured_in_office boolean not null default false,
  staff_id uuid,
  created_at timestamptz not null default now(),
  constraint estimate_signature_events_kind_check
    check (kind in ('sent', 'opened', 'signed', 'declined')),
  constraint estimate_signature_events_role_check
    check (signer_role in ('', 'primary', 'second', 'contractor'))
);

create index if not exists estimate_signature_events_estimate_id_idx
  on public.estimate_signature_events (estimate_id, created_at);

create index if not exists estimate_signature_events_company_id_idx
  on public.estimate_signature_events (company_id, created_at desc);

alter table public.estimate_signature_events enable row level security;

drop policy if exists "company read" on public.estimate_signature_events;
create policy "company read" on public.estimate_signature_events
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "company insert" on public.estimate_signature_events;
create policy "company insert" on public.estimate_signature_events
  for insert to authenticated
  with check (company_id = public.current_company_id());

grant select, insert on table public.estimate_signature_events to authenticated;

alter table public.estimate_signature_events replica identity full;

do $$
begin
  execute 'alter publication supabase_realtime add table public.estimate_signature_events';
exception
  when duplicate_object then null;
end $$;

create or replace function public.record_estimate_share_event(
  p_token text,
  p_kind text,
  p_signer_name text default '',
  p_consent_text text default '',
  p_consent_version text default '',
  p_document_sha256 text default '',
  p_document_snapshot jsonb default '{}'::jsonb,
  p_ip text default '',
  p_forwarded_for text default '',
  p_user_agent text default '',
  p_accept_language text default '',
  p_time_zone text default '',
  p_delivery_channel text default '',
  p_delivery_to text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  v_token text;
  v_kind text;
  v_role text;
  v_suffix text;
  v_hash text;
  v_contact uuid;
  inserted public.estimate_signature_events%rowtype;
begin
  v_token := trim(coalesce(p_token, ''));
  if length(v_token) < 6 then
    return null;
  end if;

  v_kind := lower(trim(coalesce(p_kind, '')));
  if v_kind not in ('sent', 'opened', 'signed', 'declined') then
    raise exception 'Unknown signature event';
  end if;

  if v_kind = 'signed' and length(trim(coalesce(p_consent_text, ''))) < 20 then
    raise exception 'Electronic signature consent is required';
  end if;

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
    v_contact := est.second_contact_id;
  else
    v_role := 'primary';
    v_contact := est.contact_id;
  end if;

  v_suffix := right(v_token, 8);
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  if v_kind = 'opened' then
    if exists (
      select 1
      from public.estimate_signature_events e
      where e.estimate_id = est.id
        and e.kind = 'opened'
        and e.token_sha256 = v_hash
        and e.created_at > now() - interval '15 minutes'
    ) then
      return null;
    end if;
  end if;

  insert into public.estimate_signature_events (
    company_id,
    estimate_id,
    kind,
    signer_role,
    contact_id,
    signer_name,
    token_suffix,
    token_sha256,
    ip_address,
    forwarded_for,
    user_agent,
    accept_language,
    time_zone,
    delivery_channel,
    delivery_to,
    consent_text,
    consent_version,
    document_sha256,
    document_snapshot
  ) values (
    est.company_id,
    est.id,
    v_kind,
    v_role,
    v_contact,
    trim(coalesce(p_signer_name, '')),
    v_suffix,
    v_hash,
    left(trim(coalesce(p_ip, '')), 80),
    left(trim(coalesce(p_forwarded_for, '')), 400),
    left(trim(coalesce(p_user_agent, '')), 500),
    left(trim(coalesce(p_accept_language, '')), 200),
    left(trim(coalesce(p_time_zone, '')), 80),
    left(trim(coalesce(p_delivery_channel, '')), 40),
    left(trim(coalesce(p_delivery_to, '')), 80),
    trim(coalesce(p_consent_text, '')),
    left(trim(coalesce(p_consent_version, '')), 40),
    left(trim(coalesce(p_document_sha256, '')), 64),
    coalesce(p_document_snapshot, '{}'::jsonb)
  )
  returning * into inserted;

  return jsonb_build_object(
    'id', inserted.id,
    'estimateId', inserted.estimate_id,
    'kind', inserted.kind,
    'signerRole', inserted.signer_role,
    'signerName', inserted.signer_name,
    'tokenSuffix', inserted.token_suffix,
    'ipAddress', inserted.ip_address,
    'userAgent', inserted.user_agent,
    'timeZone', inserted.time_zone,
    'consentText', inserted.consent_text,
    'documentSha256', inserted.document_sha256,
    'createdAt', inserted.created_at
  );
end;
$$;

create or replace function public.shared_estimate_audit(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  v_token text;
begin
  v_token := trim(coalesce(p_token, ''));
  if length(v_token) < 6 then
    return '[]'::jsonb;
  end if;

  select * into est
  from public.estimates
  where share_token = v_token
     or (second_share_token <> '' and second_share_token = v_token)
  limit 1;
  if not found then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'kind', e.kind,
      'signerRole', e.signer_role,
      'signerName', e.signer_name,
      'tokenSuffix', e.token_suffix,
      'ipAddress', e.ip_address,
      'forwardedFor', e.forwarded_for,
      'userAgent', e.user_agent,
      'acceptLanguage', e.accept_language,
      'timeZone', e.time_zone,
      'deliveryChannel', e.delivery_channel,
      'deliveryTo', e.delivery_to,
      'consentText', e.consent_text,
      'consentVersion', e.consent_version,
      'documentSha256', e.document_sha256,
      'capturedInOffice', e.captured_in_office,
      'createdAt', e.created_at
    ) order by e.created_at)
    from public.estimate_signature_events e
    where e.estimate_id = est.id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.record_estimate_share_event(
  text, text, text, text, text, text, jsonb, text, text, text, text, text, text, text
) from public;
grant execute on function public.record_estimate_share_event(
  text, text, text, text, text, text, jsonb, text, text, text, text, text, text, text
) to anon, authenticated;

revoke all on function public.shared_estimate_audit(text) from public;
grant execute on function public.shared_estimate_audit(text) to anon, authenticated;
