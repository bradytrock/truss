-- Pay at Close homeowner link, second version.
--
-- The homeowner's page moved to the short `/q/<code>` link and became four pages of
-- questions that save as they go, opened by confirming the property ZIP, with no
-- signature step (everyone on title signs the agreement later). This adds the
-- "only ask what is still open" switch, gates the public read behind the ZIP, adds a
-- save-as-you-go RPC, and drops the signature from the submit RPC. Safe to re-run.

alter table public.job_pay_at_close
  add column if not exists application_ask_only_open boolean not null default false;

-- True when the job has no ZIP on file (nothing to check) or the typed ZIP matches its first five digits.
create or replace function public.pay_at_close_zip_ok(p_job_zip text, p_zip text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(left(regexp_replace(coalesce(p_job_zip, ''), '\D', '', 'g'), 5), '') = ''
    or left(regexp_replace(coalesce(p_job_zip, ''), '\D', '', 'g'), 5)
       = left(regexp_replace(coalesce(p_zip, ''), '\D', '', 'g'), 5);
$$;

revoke all on function public.pay_at_close_zip_ok(text, text) from public;

-- Merge the homeowner's answers onto the row. Answer keys land in interview.answers marked as
-- theirs; record fields change only when the homeowner supplied a value. Called by the two
-- public RPCs below after they have checked the token, the ZIP, and the state of the row.
create or replace function public.pay_at_close_merge_homeowner_answers(p_id uuid, p_answers jsonb, p_fields jsonb)
returns void
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
  select * into rec from public.job_pay_at_close where id = p_id for update;
  if not found then
    return;
  end if;

  answers := coalesce(rec.interview->'answers', '{}'::jsonb);
  sources := coalesce(rec.interview->'sources', '{}'::jsonb);
  if jsonb_typeof(p_answers) = 'object' then
    for k in select jsonb_object_keys(p_answers) loop
      if p_answers->k is null or jsonb_typeof(p_answers->k) = 'null' then
        continue;
      end if;
      -- Office-only answers never come from the homeowner.
      if k in ('contractValue', 'completion_before_close', 'agent_committed') then
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
  if v_listing is not null then
    sources := sources || jsonb_build_object('listingStatus', 'homeowner');
  end if;
  if v_close is not null then
    sources := sources || jsonb_build_object('expectedCloseDate', 'homeowner');
  end if;
  for k in select unnest(array['listingAgent','listPrice','signerNames','titleCompany','escrowOfficer','escrowEmail','escrowPhone','escrowFileNumber']) loop
    if nullif(trim(coalesce(p_fields->>k, '')), '') is not null then
      sources := sources || jsonb_build_object(k, 'homeowner');
    end if;
  end loop;

  update public.job_pay_at_close
  set
    interview = jsonb_set(jsonb_set(coalesce(interview, '{}'::jsonb), '{answers}', answers, true), '{sources}', sources, true),
    listing_status = coalesce(v_listing, listing_status),
    listing_agent = coalesce(nullif(trim(p_fields->>'listingAgent'), ''), listing_agent),
    list_price = coalesce((p_fields->>'listPrice')::numeric, list_price),
    expected_close_date = coalesce(v_close, expected_close_date),
    signer_names = coalesce(nullif(trim(p_fields->>'signerNames'), ''), signer_names),
    title_company = coalesce(nullif(trim(p_fields->>'titleCompany'), ''), title_company),
    escrow_officer = coalesce(nullif(trim(p_fields->>'escrowOfficer'), ''), escrow_officer),
    escrow_email = coalesce(nullif(trim(p_fields->>'escrowEmail'), ''), escrow_email),
    escrow_phone = coalesce(nullif(trim(p_fields->>'escrowPhone'), ''), escrow_phone),
    escrow_file_number = coalesce(nullif(trim(p_fields->>'escrowFileNumber'), ''), escrow_file_number),
    updated_at = now()
  where id = rec.id;
end $$;

revoke all on function public.pay_at_close_merge_homeowner_answers(uuid, jsonb, jsonb) from public;

-- What the homeowner's page needs. Without the right ZIP only the intro comes back (company,
-- who to text, the address without its ZIP, the amount). With it, the saved answers too.
drop function if exists public.shared_pay_at_close_application(text);
create or replace function public.shared_pay_at_close_application(p_token text, p_zip text default null)
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
  zip_required boolean;
  unlocked boolean;
  expired boolean;
  expires_at timestamptz;
  base jsonb;
begin
  if p_token is null or length(trim(p_token)) < 6 then
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

  zip_required := coalesce(left(regexp_replace(coalesce(job.postal_code, ''), '\D', '', 'g'), 5), '') <> '';
  expires_at := rec.application_sent_at + make_interval(days => 7);
  expired := rec.application_submitted_at is null and rec.application_sent_at is not null and expires_at < now();
  unlocked := not expired and public.pay_at_close_zip_ok(job.postal_code, p_zip);

  base := jsonb_build_object(
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
      'postalCode', case when unlocked then coalesce(job.postal_code, '') else '' end
    ),
    'homeowner', coalesce(homeowner_name, ''),
    'contractValue', rec.contract_value,
    'zipRequired', zip_required,
    'unlocked', unlocked,
    'expired', expired,
    'expiresAt', expires_at,
    'askOnlyOpen', coalesce(rec.application_ask_only_open, false),
    'sentAt', rec.application_sent_at,
    'submittedAt', rec.application_submitted_at
  );

  if not unlocked then
    return base || jsonb_build_object('fields', '{}'::jsonb, 'answers', '{}'::jsonb, 'uploads', '[]'::jsonb);
  end if;

  return base || jsonb_build_object(
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
    'uploads', coalesce(rec.application_uploads, '[]'::jsonb)
  );
end $$;

revoke all on function public.shared_pay_at_close_application(text, text) from public;
grant execute on function public.shared_pay_at_close_application(text, text) to anon, authenticated;

-- Save as the homeowner goes. Nothing is stamped; the office sees the answers fill in.
create or replace function public.save_pay_at_close_application(
  p_token text,
  p_zip text,
  p_answers jsonb,
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.job_pay_at_close%rowtype;
  job_zip text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  select * into rec from public.job_pay_at_close where application_token = trim(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  select postal_code into job_zip from public.jobs where id = rec.job_id;
  if not public.pay_at_close_zip_ok(job_zip, p_zip) then
    return jsonb_build_object('ok', false, 'error', 'Confirm the property ZIP code first.', 'locked', true);
  end if;
  if rec.application_submitted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'These answers were already sent.', 'submitted', true);
  end if;
  if rec.application_sent_at is not null and rec.application_sent_at + make_interval(days => 7) < now() then
    return jsonb_build_object('ok', false, 'error', 'This link has expired. Ask for a new one.', 'expired', true);
  end if;

  perform public.pay_at_close_merge_homeowner_answers(rec.id, p_answers, p_fields);
  return jsonb_build_object('ok', true, 'savedAt', now());
end $$;

revoke all on function public.save_pay_at_close_application(text, text, jsonb, jsonb) from public;
grant execute on function public.save_pay_at_close_application(text, text, jsonb, jsonb) to anon, authenticated;

-- The homeowner taps Send. Answers merge one last time and the application is stamped.
-- Status and approval columns are never touched here.
drop function if exists public.submit_pay_at_close_application(text, jsonb, jsonb, text, text, jsonb, text, text);
create or replace function public.submit_pay_at_close_application(
  p_token text,
  p_zip text,
  p_answers jsonb,
  p_fields jsonb,
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
  job_zip text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  select * into rec from public.job_pay_at_close where application_token = trim(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  select postal_code into job_zip from public.jobs where id = rec.job_id;
  if not public.pay_at_close_zip_ok(job_zip, p_zip) then
    return jsonb_build_object('ok', false, 'error', 'Confirm the property ZIP code first.', 'locked', true);
  end if;
  if rec.application_submitted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'These answers were already sent.', 'submitted', true);
  end if;
  if rec.application_sent_at is not null and rec.application_sent_at + make_interval(days => 7) < now() then
    return jsonb_build_object('ok', false, 'error', 'This link has expired. Ask for a new one.', 'expired', true);
  end if;

  perform public.pay_at_close_merge_homeowner_answers(rec.id, p_answers, p_fields);

  update public.job_pay_at_close
  set
    application_submitted_at = now(),
    application_authorizations = case when jsonb_typeof(p_authorizations) = 'array' then p_authorizations else '[]'::jsonb end,
    application_ip = coalesce(p_ip, ''),
    application_user_agent = left(coalesce(p_user_agent, ''), 400),
    updated_at = now()
  where id = rec.id;

  return jsonb_build_object('ok', true, 'submittedAt', now());
end $$;

revoke all on function public.submit_pay_at_close_application(text, text, jsonb, jsonb, jsonb, text, text) from public;
grant execute on function public.submit_pay_at_close_application(text, text, jsonb, jsonb, jsonb, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
