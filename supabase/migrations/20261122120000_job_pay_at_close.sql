-- Pay at Close: repairs completed before a home sale, paid from seller proceeds at closing.
-- One row per job. Public property record, liens, checklist, and the risk report live in jsonb
-- so a round trip saves the whole underwriting file.

create table if not exists public.job_pay_at_close (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null default 'screening',
  contract_value numeric(14, 2) not null default 0,
  deposit_amount numeric(14, 2) not null default 0,
  expected_close_date date,
  listing_status text not null default '',
  list_price numeric(14, 2) not null default 0,
  contract_price numeric(14, 2) not null default 0,
  seller_concessions numeric(14, 2) not null default 0,
  title_company text not null default '',
  escrow_officer text not null default '',
  escrow_email text not null default '',
  escrow_phone text not null default '',
  escrow_file_number text not null default '',
  listing_agent text not null default '',
  signer_names text not null default '',
  property jsonb,
  liens jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  report jsonb,
  notes text not null default '',
  requested_by uuid references public.team_members (id) on delete set null,
  requested_by_name text not null default '',
  requested_at timestamptz,
  decided_by uuid references public.team_members (id) on delete set null,
  decided_by_name text not null default '',
  decided_at timestamptz,
  decision_note text not null default '',
  interview jsonb not null default '{"answers":{},"completedAt":null}'::jsonb,
  application_token text,
  application_sent_at timestamptz,
  application_sent_to text not null default '',
  application_submitted_at timestamptz,
  application_signature_name text not null default '',
  application_signature_image text not null default '',
  application_authorizations jsonb not null default '[]'::jsonb,
  application_uploads jsonb not null default '[]'::jsonb,
  application_ip text not null default '',
  application_user_agent text not null default '',
  updated_at timestamptz not null default now(),
  constraint job_pay_at_close_job_id_key unique (job_id),
  constraint job_pay_at_close_status_check check (
    status in (
      'screening',
      'approved',
      'declined',
      'in_progress',
      'awaiting_close',
      'paid',
      'fell_through'
    )
  )
);

create index if not exists job_pay_at_close_company_id_idx on public.job_pay_at_close (company_id);
create index if not exists job_pay_at_close_status_idx on public.job_pay_at_close (company_id, status);
create index if not exists job_pay_at_close_close_date_idx on public.job_pay_at_close (company_id, expected_close_date);

alter table public.job_pay_at_close enable row level security;

drop policy if exists "company isolation" on public.job_pay_at_close;
create policy "company isolation" on public.job_pay_at_close
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.job_pay_at_close to authenticated;

-- Approving or declining a request is a company admin decision. The UI hides the controls
-- from everyone else; this trigger makes the rule hold for any client.
create or replace function public.job_pay_at_close_guard_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  decision_changed boolean;
begin
  decision_changed :=
    tg_op = 'INSERT'
      and (new.status in ('approved', 'declined') or new.decided_at is not null)
    or tg_op = 'UPDATE'
      and (
        (new.status in ('approved', 'declined') and new.status is distinct from old.status)
        or new.decided_at is distinct from old.decided_at
        or new.decided_by is distinct from old.decided_by
      );
  if decision_changed and auth.uid() is not null and not public.current_is_company_admin() then
    raise exception 'Only a company admin can approve or decline a pay-at-close request.'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'screening' and old.decided_at is null
     and new.status in ('in_progress', 'awaiting_close', 'paid') then
    raise exception 'A pay-at-close request must be approved by a company admin before work starts.'
      using errcode = '23514';
  end if;
  -- A signed homeowner application is a record. Office saves that arrive with a stale copy
  -- keep the signed columns as they were; the homeowner's RPC is the only path that sets them.
  if tg_op = 'UPDATE' and old.application_submitted_at is not null and auth.uid() is not null then
    new.application_submitted_at := old.application_submitted_at;
    new.application_signature_name := old.application_signature_name;
    new.application_signature_image := old.application_signature_image;
    new.application_authorizations := old.application_authorizations;
    new.application_ip := old.application_ip;
    new.application_user_agent := old.application_user_agent;
    new.application_uploads := old.application_uploads;
  end if;
  return new;
end $$;

revoke all on function public.job_pay_at_close_guard_decision() from public;

drop trigger if exists job_pay_at_close_guard_decision on public.job_pay_at_close;
create trigger job_pay_at_close_guard_decision
  before insert or update on public.job_pay_at_close
  for each row execute function public.job_pay_at_close_guard_decision();

do $$
begin
  execute 'alter publication supabase_realtime add table public.job_pay_at_close';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Homeowner application. The office sends a tokenized link; the homeowner answers
-- the qualification questions in their own words, uploads a payoff statement, checks
-- the authorizations, and signs. Everything lands on the same row.
-- ---------------------------------------------------------------------------

-- Columns added after the first version of this migration shipped. Safe to re-run.
alter table public.job_pay_at_close
  add column if not exists requested_by uuid references public.team_members (id) on delete set null,
  add column if not exists requested_by_name text not null default '',
  add column if not exists requested_at timestamptz,
  add column if not exists decided_by uuid references public.team_members (id) on delete set null,
  add column if not exists decided_by_name text not null default '',
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text not null default '',
  add column if not exists interview jsonb not null default '{"answers":{},"completedAt":null}'::jsonb,
  add column if not exists application_token text,
  add column if not exists application_sent_at timestamptz,
  add column if not exists application_sent_to text not null default '',
  add column if not exists application_submitted_at timestamptz,
  add column if not exists application_signature_name text not null default '',
  add column if not exists application_signature_image text not null default '',
  add column if not exists application_authorizations jsonb not null default '[]'::jsonb,
  add column if not exists application_uploads jsonb not null default '[]'::jsonb,
  add column if not exists application_ip text not null default '',
  add column if not exists application_user_agent text not null default '';

create unique index if not exists job_pay_at_close_application_token_key
  on public.job_pay_at_close (application_token)
  where application_token is not null;

-- What the homeowner's page needs. Anonymous callers get only this row's public shape.
create or replace function public.shared_pay_at_close_application(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.job_pay_at_close%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  rep public.team_members%rowtype;
  homeowner_name text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into rec from public.job_pay_at_close where application_token = trim(p_token) limit 1;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = rec.job_id;
  select * into company from public.companies where id = rec.company_id;
  if rec.requested_by is not null then
    select * into rep from public.team_members where id = rec.requested_by;
  end if;
  if rep.id is null and job.owner_staff_id is not null then
    select * into rep from public.team_members where id = job.owner_staff_id;
  end if;
  select name into homeowner_name from public.contacts where id = job.primary_contact_id;

  return jsonb_build_object(
    'token', rec.application_token,
    'company', jsonb_build_object(
      'name', coalesce(company.name, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'logoUrl', coalesce(company.logo_url, '')
    ),
    'rep', case when rep.id is null then null else jsonb_build_object(
      'name', coalesce(rep.name, ''),
      'title', coalesce(rep.title, ''),
      'phone', coalesce(rep.phone, ''),
      'email', coalesce(rep.email, '')
    ) end,
    'job', jsonb_build_object(
      'name', coalesce(job.name, ''),
      'street', coalesce(job.street, ''),
      'city', coalesce(job.city, ''),
      'state', coalesce(job.state, ''),
      'postalCode', coalesce(job.postal_code, '')
    ),
    'homeowner', coalesce(homeowner_name, ''),
    'contractValue', rec.contract_value,
    'fields', jsonb_build_object(
      'listingStatus', rec.listing_status,
      'listingAgent', rec.listing_agent,
      'listPrice', rec.list_price,
      'contractPrice', rec.contract_price,
      'expectedCloseDate', rec.expected_close_date,
      'signerNames', rec.signer_names,
      'depositAmount', rec.deposit_amount,
      'titleCompany', rec.title_company,
      'escrowOfficer', rec.escrow_officer,
      'escrowEmail', rec.escrow_email,
      'escrowPhone', rec.escrow_phone,
      'escrowFileNumber', rec.escrow_file_number
    ),
    'answers', coalesce(rec.interview->'answers', '{}'::jsonb),
    'sentAt', rec.application_sent_at,
    'submittedAt', rec.application_submitted_at,
    'signatureName', rec.application_signature_name,
    'uploads', coalesce(rec.application_uploads, '[]'::jsonb)
  );
end $$;

revoke all on function public.shared_pay_at_close_application(text) from public;
grant execute on function public.shared_pay_at_close_application(text) to anon, authenticated;

-- The homeowner submits once. Answers merge into the interview and are marked as theirs;
-- record fields update only when the homeowner supplied a value. Signature and every
-- authorization are required. Status and approval columns are never touched here.
create or replace function public.submit_pay_at_close_application(
  p_token text,
  p_answers jsonb,
  p_fields jsonb,
  p_signature_name text,
  p_signature_image text,
  p_authorizations jsonb,
  p_ip text default '',
  p_user_agent text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.job_pay_at_close%rowtype;
  answers jsonb;
  sources jsonb;
  k text;
  v_listing text;
  v_close date;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  select * into rec from public.job_pay_at_close where application_token = trim(p_token) for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  if rec.application_submitted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This application was already submitted.', 'submitted', true);
  end if;
  if coalesce(trim(p_signature_name), '') = '' or coalesce(p_signature_image, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Type and draw your signature to submit.');
  end if;
  if jsonb_typeof(p_authorizations) <> 'array' or jsonb_array_length(p_authorizations) < 4 then
    return jsonb_build_object('ok', false, 'error', 'Check each authorization to submit.');
  end if;

  answers := coalesce(rec.interview->'answers', '{}'::jsonb);
  sources := coalesce(rec.interview->'sources', '{}'::jsonb);
  if jsonb_typeof(p_answers) = 'object' then
    for k in select jsonb_object_keys(p_answers) loop
      if p_answers->k is null or jsonb_typeof(p_answers->k) = 'null' then
        continue;
      end if;
      answers := answers || jsonb_build_object(k, p_answers->k);
      sources := sources || jsonb_build_object(k, 'homeowner');
    end loop;
  end if;

  v_listing := nullif(trim(coalesce(p_fields->>'listingStatus', '')), '');
  if v_listing is not null and v_listing not in ('not_listed','coming_soon','active','pending','under_contract','sold','off_market') then
    v_listing := null;
  end if;
  begin
    v_close := nullif(trim(coalesce(p_fields->>'expectedCloseDate', '')), '')::date;
  exception when others then
    v_close := null;
  end;

  update public.job_pay_at_close
  set
    interview = jsonb_set(jsonb_set(coalesce(interview, '{}'::jsonb), '{answers}', answers, true), '{sources}', sources, true),
    listing_status = coalesce(v_listing, listing_status),
    listing_agent = coalesce(nullif(trim(p_fields->>'listingAgent'), ''), listing_agent),
    list_price = coalesce((p_fields->>'listPrice')::numeric, list_price),
    contract_price = coalesce((p_fields->>'contractPrice')::numeric, contract_price),
    expected_close_date = coalesce(v_close, expected_close_date),
    signer_names = coalesce(nullif(trim(p_fields->>'signerNames'), ''), signer_names),
    deposit_amount = coalesce((p_fields->>'depositAmount')::numeric, deposit_amount),
    title_company = coalesce(nullif(trim(p_fields->>'titleCompany'), ''), title_company),
    escrow_officer = coalesce(nullif(trim(p_fields->>'escrowOfficer'), ''), escrow_officer),
    escrow_email = coalesce(nullif(trim(p_fields->>'escrowEmail'), ''), escrow_email),
    escrow_phone = coalesce(nullif(trim(p_fields->>'escrowPhone'), ''), escrow_phone),
    escrow_file_number = coalesce(nullif(trim(p_fields->>'escrowFileNumber'), ''), escrow_file_number),
    application_submitted_at = now(),
    application_signature_name = trim(p_signature_name),
    application_signature_image = p_signature_image,
    application_authorizations = p_authorizations,
    application_ip = coalesce(p_ip, ''),
    application_user_agent = left(coalesce(p_user_agent, ''), 400),
    updated_at = now()
  where id = rec.id;

  return jsonb_build_object('ok', true, 'submittedAt', now());
end $$;

revoke all on function public.submit_pay_at_close_application(text, jsonb, jsonb, text, text, jsonb, text, text) from public;
grant execute on function public.submit_pay_at_close_application(text, jsonb, jsonb, text, text, jsonb, text, text) to anon, authenticated;

-- Private bucket. The homeowner's file is written by the server with the service role;
-- the office reads it with a signed URL under the company folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pay-at-close-applications', 'pay-at-close-applications', false, 15728640, null)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company pay at close applications" on storage.objects;
create policy "company pay at close applications"
on storage.objects for select to authenticated
using (
  bucket_id = 'pay-at-close-applications'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

notify pgrst, 'reload schema';
