-- Realtor portal: invite referral partners to see jobs they sent, schedules,
-- and listings we track for their pipeline. Daily browse finds new listings
-- and notifies the staff owner (project manager) who owns that realtor.

alter table public.contacts
  add column if not exists listing_watch_url text not null default '',
  add column if not exists listing_watch_enabled boolean not null default false;

create table if not exists public.realtor_portal_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists realtor_portal_invites_token_key
  on public.realtor_portal_invites (token);
create index if not exists realtor_portal_invites_company_contact_idx
  on public.realtor_portal_invites (company_id, contact_id)
  where revoked_at is null;

alter table public.realtor_portal_invites enable row level security;

drop policy if exists "company isolation" on public.realtor_portal_invites;
create policy "company isolation" on public.realtor_portal_invites
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.realtor_listings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  external_key text not null default '',
  title text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  price numeric,
  status text not null default 'active'
    check (status in ('active', 'pending', 'sold', 'off_market', 'unknown')),
  beds numeric,
  baths numeric,
  sqft integer,
  listed_at date,
  source text not null default 'browse',
  source_url text not null default '',
  summary text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists realtor_listings_company_contact_key
  on public.realtor_listings (company_id, contact_id, external_key);
create index if not exists realtor_listings_contact_idx
  on public.realtor_listings (contact_id, last_seen_at desc);
create index if not exists realtor_listings_notify_idx
  on public.realtor_listings (company_id, notified_at)
  where notified_at is null;

alter table public.realtor_listings enable row level security;

drop policy if exists "company isolation" on public.realtor_listings;
create policy "company isolation" on public.realtor_listings
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.realtor_listing_browse_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'error', 'skipped')),
  listings_found integer not null default 0,
  new_listings integer not null default 0,
  error text not null default '',
  source_url text not null default ''
);

create index if not exists realtor_listing_browse_runs_contact_idx
  on public.realtor_listing_browse_runs (contact_id, started_at desc);

alter table public.realtor_listing_browse_runs enable row level security;

drop policy if exists "company isolation" on public.realtor_listing_browse_runs;
create policy "company isolation" on public.realtor_listing_browse_runs
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create or replace function public.realtor_portal_invite_is_active(inv public.realtor_portal_invites)
returns boolean
language sql
stable
as $$
  select inv.revoked_at is null and inv.expires_at > now();
$$;

create or replace function public.realtor_jobs_for_contact(p_company_id uuid, p_contact_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(x.id order by x.start_date desc nulls last, x.created_at desc)
      from (
        select distinct j.id, j.start_date, j.created_at
        from public.jobs j
        where j.company_id = p_company_id
          and j.deleted_at is null
          and (
            p_contact_id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
            or exists (
              select 1
              from public.opportunities o
              where o.company_id = p_company_id
                and o.referral_contact_id = p_contact_id
                and (
                  o.id = j.opportunity_id
                  or (j.opportunity_id is null and o.primary_contact_id = j.primary_contact_id)
                )
            )
          )
      ) x
    ),
    '{}'::uuid[]
  );
$$;

create or replace function public.shared_realtor_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.realtor_portal_invites%rowtype;
  company public.companies%rowtype;
  contact public.contacts%rowtype;
  v_token text;
  v_job_ids uuid[];
  v_owner_name text := '';
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);

  select * into inv
  from public.realtor_portal_invites
  where token = v_token
  limit 1;
  if not found then
    return null;
  end if;
  if not public.realtor_portal_invite_is_active(inv) then
    return null;
  end if;

  update public.realtor_portal_invites
  set last_opened_at = now()
  where id = inv.id;

  select * into company from public.companies where id = inv.company_id;
  select * into contact from public.contacts where id = inv.contact_id;
  if company.id is null or contact.id is null then
    return null;
  end if;
  if not coalesce(contact.is_referral_partner, false) then
    return null;
  end if;

  select coalesce(s.name, '') into v_owner_name
  from public.team_members s
  where s.id = contact.owner_staff_id
  limit 1;

  v_job_ids := public.realtor_jobs_for_contact(inv.company_id, inv.contact_id);

  return jsonb_build_object(
    'token', inv.token,
    'expiresAt', inv.expires_at,
    'company', jsonb_build_object(
      'name', coalesce(company.name, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'logoUrl', coalesce(company.logo_url, '')
    ),
    'contact', jsonb_build_object(
      'id', contact.id,
      'name', coalesce(contact.name, 'Partner'),
      'email', coalesce(contact.email, ''),
      'phone', coalesce(contact.phone, ''),
      'title', coalesce(contact.title, ''),
      'ownerName', v_owner_name,
      'listingWatchUrl', coalesce(contact.listing_watch_url, ''),
      'listingWatchEnabled', coalesce(contact.listing_watch_enabled, false)
    ),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'code', coalesce(o.code, ''),
        'name', coalesce(o.name, 'Referral'),
        'stage', coalesce(o.stage::text, ''),
        'value', coalesce(o.value, 0),
        'leadSource', coalesce(o.lead_source, ''),
        'createdAt', o.created_at,
        'location', coalesce(nullif(trim(both ', ' from concat_ws(', ',
          nullif(o.street, ''), nullif(o.city, ''), nullif(o.state, '')
        )), ''), coalesce(o.location, '')),
        'jobId', (
          select j.id
          from public.jobs j
          where j.company_id = inv.company_id
            and j.deleted_at is null
            and j.opportunity_id = o.id
          order by j.created_at desc
          limit 1
        )
      ) order by o.created_at desc)
      from public.opportunities o
      where o.company_id = inv.company_id
        and o.referral_contact_id = inv.contact_id
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'code', j.code,
        'name', j.name,
        'status', j.status,
        'location', coalesce(nullif(trim(both ', ' from concat_ws(', ',
          nullif(j.street, ''), nullif(j.city, ''), nullif(j.state, '')
        )), ''), j.location),
        'startDate', j.start_date,
        'projectManager', coalesce(j.project_manager, ''),
        'superintendent', coalesce(j.superintendent, ''),
        'salesRep', coalesce(j.sales_rep, ''),
        'assigned', to_jsonb(coalesce(j.assigned, '{}'::text[])),
        'schedule', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'kind', e.kind,
            'startsAt', e.starts_at,
            'endsAt', e.ends_at,
            'location', coalesce(e.location, ''),
            'assignee', coalesce(e.assignee, ''),
            'notes', coalesce(e.notes, '')
          ) order by e.starts_at)
          from public.schedule_events e
          where e.job_id = j.id
            and e.company_id = inv.company_id
            and e.starts_at >= (now() - interval '14 days')
        ), '[]'::jsonb)
      ) order by j.start_date desc nulls last, j.created_at desc)
      from public.jobs j
      where j.id = any (v_job_ids)
        and j.company_id = inv.company_id
        and j.deleted_at is null
    ), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'address', l.address,
        'city', l.city,
        'state', l.state,
        'postalCode', l.postal_code,
        'price', l.price,
        'status', l.status,
        'beds', l.beds,
        'baths', l.baths,
        'sqft', l.sqft,
        'listedAt', l.listed_at,
        'source', l.source,
        'sourceUrl', l.source_url,
        'summary', l.summary,
        'firstSeenAt', l.first_seen_at,
        'lastSeenAt', l.last_seen_at
      ) order by l.last_seen_at desc)
      from public.realtor_listings l
      where l.company_id = inv.company_id
        and l.contact_id = inv.contact_id
    ), '[]'::jsonb),
    'pipeline', jsonb_build_object(
      'watchEnabled', coalesce(contact.listing_watch_enabled, false),
      'watchUrl', coalesce(contact.listing_watch_url, ''),
      'activeListings', coalesce((
        select count(*)::int
        from public.realtor_listings l
        where l.contact_id = inv.contact_id
          and l.company_id = inv.company_id
          and l.status in ('active', 'pending', 'unknown')
      ), 0),
      'openReferrals', coalesce((
        select count(*)::int
        from public.opportunities o
        where o.referral_contact_id = inv.contact_id
          and o.company_id = inv.company_id
          and o.stage::text not in ('lost', 'awarded')
      ), 0)
    )
  );
end;
$$;

revoke all on function public.realtor_portal_invite_is_active(public.realtor_portal_invites) from public;
revoke all on function public.realtor_jobs_for_contact(uuid, uuid) from public;
revoke all on function public.shared_realtor_portal(text) from public;
grant execute on function public.shared_realtor_portal(text) to anon, authenticated;

-- Daily listing browse helpers (security definer; cron route authorizes with CRON_SECRET).

create or replace function public.realtor_listing_watches()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'companyId', c.company_id,
      'contactId', c.id,
      'contactName', coalesce(c.name, 'Partner'),
      'watchUrl', coalesce(c.listing_watch_url, ''),
      'ownerStaffId', c.owner_staff_id,
      'ownerName', coalesce(s.name, ''),
      'ownerPhone', coalesce(s.phone, '')
    ) order by c.name)
    from public.contacts c
    left join public.team_members s on s.id = c.owner_staff_id
    where coalesce(c.is_referral_partner, false)
      and coalesce(c.listing_watch_enabled, false)
      and length(trim(coalesce(c.listing_watch_url, ''))) > 8
  ), '[]'::jsonb);
$$;

-- ingest_realtor_listing_browse is managed in the database; keep grant surface here.
revoke all on function public.realtor_listing_watches() from public;
grant execute on function public.realtor_listing_watches() to anon, authenticated;
