-- Truss schema bootstrap. Paste this entire file into the Supabase SQL editor and run once.
-- Safe to re-run if objects already exist. Individual files remain in supabase/migrations/.

-- ========== 20260819170000_truss_crm.sql ==========
-- Truss CRM: companies, profiles, pipeline, jobs, activity.
-- RLS isolates every row to the signed-in user's company.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.pipeline_stage as enum (
  'pursuing',
  'estimating',
  'bid_submitted',
  'interview',
  'awarded',
  'lost'
);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.job_status as enum (
  'precon',
  'in_progress',
  'punch',
  'complete',
  'on_hold'
);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_type as enum (
  'commercial',
  'multifamily',
  'healthcare',
  'education',
  'industrial',
  'hospitality',
  'civic',
  'tenant_improvement'
);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.delivery_method as enum (
  'design_bid_build',
  'cm_at_risk',
  'design_build',
  'gc_mp'
);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.client_type as enum (
  'owner',
  'developer',
  'public',
  'healthcare_system',
  'architect'
);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_type as enum (
  'note',
  'call',
  'email',
  'meeting',
  'site_walk',
  'stage_change'
);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.entity_kind as enum (
  'opportunity',
  'job',
  'client'
);
exception
  when duplicate_object then null;
end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  title text not null default 'Team member',
  initials text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_company_id_idx on public.profiles (company_id);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  title text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists team_members_company_id_idx on public.team_members (company_id);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  type public.client_type not null,
  city text not null,
  state text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists clients_company_id_idx on public.clients (company_id);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  title text not null default '',
  email text not null default '',
  phone text not null default ''
);

create index if not exists contacts_company_id_idx on public.contacts (company_id);
create index if not exists contacts_client_id_idx on public.contacts (client_id);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  primary_contact_id uuid references public.contacts (id) on delete set null,
  stage public.pipeline_stage not null default 'pursuing',
  value numeric(14, 2) not null default 0,
  bid_due_at date,
  pre_bid_walk_at date,
  location text not null default '',
  project_type public.project_type not null,
  delivery_method public.delivery_method not null,
  estimator text not null default '',
  win_probability integer not null default 15,
  next_step text not null default '',
  lost_reason text,
  created_at timestamptz not null default now()
);

create index if not exists opportunities_company_id_stage_idx on public.opportunities (company_id, stage);
create index if not exists opportunities_client_id_idx on public.opportunities (client_id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  status public.job_status not null default 'precon',
  contract_value numeric(14, 2) not null default 0,
  start_date date not null default current_date,
  substantial_completion date,
  superintendent text not null default '',
  project_manager text not null default '',
  location text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists jobs_company_id_status_idx on public.jobs (company_id, status);
create index if not exists jobs_opportunity_id_idx on public.jobs (opportunity_id);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entity_type public.entity_kind not null,
  entity_id uuid not null,
  type public.activity_type not null default 'note',
  body text not null,
  author text not null,
  created_at timestamptz not null default now()
);

create index if not exists activities_company_entity_idx
  on public.activities (company_id, entity_type, entity_id, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  due_at date not null,
  completed boolean not null default false,
  related_type public.entity_kind,
  related_id uuid,
  assignee text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists tasks_company_open_due_idx
  on public.tasks (company_id, completed, due_at);

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_company_id() from public;
grant execute on function public.current_company_id() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  full_name text;
  title text;
  company_name text;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  title := coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), 'VP, Preconstruction');
  company_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company'), ''), 'Northline Construction');

  insert into public.companies (name)
  values (company_name)
  returning id into new_company_id;

  insert into public.profiles (id, company_id, full_name, title, initials)
  values (
    new.id,
    new_company_id,
    full_name,
    title,
    upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
      || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), '')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.opportunities enable row level security;
alter table public.jobs enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "read own company" on public.companies;
create policy "read own company" on public.companies
  for select to authenticated
  using (id = public.current_company_id());

drop policy if exists "update own company" on public.companies;
create policy "update own company" on public.companies
  for update to authenticated
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

drop policy if exists "read company profiles" on public.profiles;
create policy "read company profiles" on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "company isolation" on public.team_members;
create policy "company isolation" on public.team_members
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.clients;
create policy "company isolation" on public.clients
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.contacts;
create policy "company isolation" on public.contacts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.opportunities;
create policy "company isolation" on public.opportunities
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.jobs;
create policy "company isolation" on public.jobs
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.activities;
create policy "company isolation" on public.activities
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.tasks;
create policy "company isolation" on public.tasks
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'companies',
    'profiles',
    'team_members',
    'clients',
    'contacts',
    'opportunities',
    'jobs',
    'activities',
    'tasks'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- ========== 20260819180000_estimates_invoices_schedule.sql ==========
-- Estimates, price book, invoices, payments, schedule, and job photos.

do $$ begin
  create type public.catalog_kind as enum ('labor', 'material', 'equipment', 'allowance', 'subcontract');
exception
  when duplicate_object then null;
end $$;
do $$ begin
  create type public.estimate_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined');
exception
  when duplicate_object then null;
end $$;
do $$ begin
  create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'overdue', 'void');
exception
  when duplicate_object then null;
end $$;
do $$ begin
  create type public.event_kind as enum (
  'site_walk',
  'pre_bid',
  'inspection',
  'production',
  'meeting',
  'punch'
);
exception
  when duplicate_object then null;
end $$;
do $$ begin
  create type public.photo_category as enum ('before', 'progress', 'after', 'issue');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  kind public.catalog_kind not null,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  cost_code text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists catalog_items_company_id_idx on public.catalog_items (company_id);

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  status public.estimate_status not null default 'draft',
  notes text not null default '',
  valid_until date,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists estimates_company_status_idx on public.estimates (company_id, status);
create unique index if not exists estimates_company_number_idx on public.estimates (company_id, number);

create table if not exists public.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  description text not null,
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists estimate_lines_estimate_id_idx on public.estimate_lines (estimate_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete set null,
  estimate_id uuid references public.estimates (id) on delete set null,
  status public.invoice_status not null default 'draft',
  issued_at date not null default current_date,
  due_at date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists invoices_company_status_idx on public.invoices (company_id, status);
create unique index if not exists invoices_company_number_idx on public.invoices (company_id, number);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(14, 2) not null,
  method text not null default 'check',
  paid_at date not null default current_date,
  reference text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payments_invoice_id_idx on public.payments (invoice_id);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  kind public.event_kind not null default 'meeting',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '',
  assignee text not null default '',
  opportunity_id uuid references public.opportunities (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists schedule_events_company_starts_idx on public.schedule_events (company_id, starts_at);

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  caption text not null default '',
  category public.photo_category not null default 'progress',
  taken_at date not null default current_date,
  image_url text not null,
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists job_photos_job_id_idx on public.job_photos (job_id);

alter table public.catalog_items enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.schedule_events enable row level security;
alter table public.job_photos enable row level security;

drop policy if exists "company isolation" on public.catalog_items;
create policy "company isolation" on public.catalog_items
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.estimates;
create policy "company isolation" on public.estimates
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.estimate_lines;
create policy "company isolation" on public.estimate_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.invoices;
create policy "company isolation" on public.invoices
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.invoice_lines;
create policy "company isolation" on public.invoice_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.payments;
create policy "company isolation" on public.payments
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.schedule_events;
create policy "company isolation" on public.schedule_events
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.job_photos;
create policy "company isolation" on public.job_photos
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'catalog_items',
    'estimates',
    'estimate_lines',
    'invoices',
    'invoice_lines',
    'payments',
    'schedule_events',
    'job_photos'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "public read job photos"
on storage.objects for select
to public
using (bucket_id = 'job-photos');

create policy "company photo files"
on storage.objects for all to authenticated
using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

-- ========== 20260819190000_seats_contacts.sql ==========
-- Seats, teams, contact-book ownership, referral partners.

do $$ begin
  create type public.seat_role as enum (
  'company_admin',
  'business_development',
  'team_lead',
  'team_admin',
  'project_manager',
  'estimator',
  'superintendent'
);
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists role public.seat_role not null default 'project_manager';

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  lead_staff_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists teams_company_id_idx on public.teams (company_id);

alter table public.team_members
  add column if not exists role public.seat_role not null default 'project_manager',
  add column if not exists team_id uuid references public.teams (id) on delete set null,
  add column if not exists initials text not null default '';

create index if not exists team_members_team_id_idx on public.team_members (team_id);

alter table public.teams
  drop constraint if exists teams_lead_staff_id_fkey;

alter table public.teams
  add constraint teams_lead_staff_id_fkey
  foreign key (lead_staff_id) references public.team_members (id) on delete set null;

alter table public.contacts
  add column if not exists owner_staff_id uuid references public.team_members (id) on delete set null,
  add column if not exists is_referral_partner boolean not null default false;

alter table public.opportunities
  add column if not exists owner_staff_id uuid references public.team_members (id) on delete set null;

alter table public.jobs
  add column if not exists owner_staff_id uuid references public.team_members (id) on delete set null;

create index if not exists contacts_owner_staff_id_idx on public.contacts (owner_staff_id);
create index if not exists jobs_owner_staff_id_idx on public.jobs (owner_staff_id);
create index if not exists opportunities_owner_staff_id_idx on public.opportunities (owner_staff_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  full_name text;
  title text;
  company_name text;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  title := coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), 'Company admin');
  company_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company'), ''), 'Northline Construction');

  insert into public.companies (name)
  values (company_name)
  returning id into new_company_id;

  insert into public.profiles (id, company_id, full_name, title, initials, role)
  values (
    new.id,
    new_company_id,
    full_name,
    title,
    upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
      || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), ''),
    'company_admin'
  );

  return new;
end;
$$;

alter table public.teams enable row level security;

drop policy if exists "company isolation" on public.teams;
create policy "company isolation" on public.teams
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
begin
  execute 'alter publication supabase_realtime add table public.teams';
exception
  when duplicate_object then null;
end $$;

-- ========== 20260819200000_residential_homeowners.sql ==========
-- Homeowners do not need a company. Residential project types and claim/T&M delivery.

alter type public.project_type add value if not exists 'restoration';
alter type public.project_type add value if not exists 'remodel';
alter type public.project_type add value if not exists 'roofing';
alter type public.project_type add value if not exists 'exterior';
alter type public.project_type add value if not exists 'addition';

alter type public.delivery_method add value if not exists 'insurance_claim';
alter type public.delivery_method add value if not exists 'fixed_price';
alter type public.delivery_method add value if not exists 'time_and_materials';

alter type public.client_type add value if not exists 'insurance';
alter type public.client_type add value if not exists 'realtor';
alter type public.client_type add value if not exists 'trade_partner';

alter table public.contacts
  alter column client_id drop not null;

alter table public.contacts
  drop constraint if exists contacts_client_id_fkey;

alter table public.contacts
  add constraint contacts_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

alter table public.opportunities
  alter column client_id drop not null;

alter table public.jobs
  alter column client_id drop not null;

alter table public.jobs
  add column if not exists primary_contact_id uuid references public.contacts (id) on delete set null;

create index if not exists jobs_primary_contact_id_idx on public.jobs (primary_contact_id);

alter table public.estimates
  alter column client_id drop not null;

alter table public.invoices
  alter column client_id drop not null;

-- ========== 20260819210000_company_settings.sql ==========
-- Company business profile: phone, email, address, license.
-- Used by Settings and shown on estimates / invoices.

alter table public.companies
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists website text not null default '',
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists license_number text not null default '',
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "update own company" on public.companies;
drop policy if exists "admins update company" on public.companies;

create policy "admins update company" on public.companies
  for update to authenticated
  using (
    id = public.current_company_id()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'company_admin'
    )
  )
  with check (
    id = public.current_company_id()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'company_admin'
    )
  );

-- ========== 20260819220000_job_codes.sql ==========
-- Job / pipeline record codes: BJ081926-A (creator initials + MMDDYY + daily letter).

alter table public.opportunities
  add column if not exists code text not null default '';

alter table public.jobs
  add column if not exists code text not null default '';

create index if not exists opportunities_company_code_idx
  on public.opportunities (company_id, code);

create index if not exists jobs_company_code_idx
  on public.jobs (company_id, code);

-- ========== 20260819230000_google_calendars.sql ==========
-- Per-user Google Calendar links, team sharing, and admin visibility.

create table if not exists public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  google_email text not null default '',
  google_calendar_id text not null default 'primary',
  linked boolean not null default false,
  linked_at timestamptz,
  share_with_team boolean not null default false,
  source text not null default 'demo' check (source in ('demo', 'google')),
  created_at timestamptz not null default now(),
  unique (company_id, staff_id)
);

create index if not exists calendar_accounts_company_idx on public.calendar_accounts (company_id);

create table if not exists public.calendar_tokens (
  account_id uuid primary key references public.calendar_accounts (id) on delete cascade,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz
);

create table if not exists public.calendar_shares (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  owner_staff_id uuid not null references public.team_members (id) on delete cascade,
  viewer_staff_id uuid not null references public.team_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_staff_id, viewer_staff_id)
);

create index if not exists calendar_shares_company_idx on public.calendar_shares (company_id);

alter table public.calendar_accounts enable row level security;
alter table public.calendar_tokens enable row level security;
alter table public.calendar_shares enable row level security;

drop policy if exists "company isolation" on public.calendar_accounts;
create policy "company isolation" on public.calendar_accounts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.calendar_shares;
create policy "company isolation" on public.calendar_shares
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Tokens never leave through the Data API. Access is RPC-only.
revoke all on public.calendar_tokens from anon, authenticated, public;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.id
  from public.profiles p
  join public.team_members tm
    on tm.company_id = p.company_id
   and tm.name = p.full_name
  where p.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_staff_id() from public;
grant execute on function public.current_staff_id() to authenticated;

create or replace function public.current_is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'company_admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

revoke all on function public.current_is_company_admin() from public;
grant execute on function public.current_is_company_admin() to authenticated;

create or replace function public.can_view_staff_calendar(target_staff_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid;
  viewer_team uuid;
  owner_team uuid;
  shared_team boolean;
begin
  viewer := public.current_staff_id();
  if viewer is not null and viewer = target_staff_id then
    return true;
  end if;
  if public.current_is_company_admin() then
    return true;
  end if;
  if viewer is null then
    return false;
  end if;

  select tm.team_id into viewer_team from public.team_members tm where tm.id = viewer;
  select tm.team_id into owner_team from public.team_members tm where tm.id = target_staff_id;
  select coalesce(ca.share_with_team, false) into shared_team
    from public.calendar_accounts ca
    where ca.staff_id = target_staff_id
      and ca.company_id = public.current_company_id();

  if shared_team and viewer_team is not null and viewer_team = owner_team then
    return true;
  end if;

  return exists (
    select 1
    from public.calendar_shares s
    where s.owner_staff_id = target_staff_id
      and s.viewer_staff_id = viewer
      and s.company_id = public.current_company_id()
  );
end;
$$;

revoke all on function public.can_view_staff_calendar(uuid) from public;
grant execute on function public.can_view_staff_calendar(uuid) to authenticated;

create or replace function public.save_google_calendar_tokens(
  p_staff_id uuid,
  p_google_email text,
  p_calendar_id text,
  p_refresh_token text,
  p_access_token text,
  p_token_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account uuid;
  company uuid;
begin
  company := public.current_company_id();
  if company is null then
    raise exception 'Not signed in';
  end if;
  if public.current_staff_id() is distinct from p_staff_id and not public.current_is_company_admin() then
    raise exception 'You can only connect your own Google Calendar';
  end if;

  insert into public.calendar_accounts (
    company_id, staff_id, google_email, google_calendar_id, linked, linked_at, source
  )
  values (
    company, p_staff_id, p_google_email, coalesce(nullif(p_calendar_id, ''), 'primary'),
    true, now(), 'google'
  )
  on conflict (company_id, staff_id) do update
    set google_email = excluded.google_email,
        google_calendar_id = excluded.google_calendar_id,
        linked = true,
        linked_at = now(),
        source = 'google';

  select id into account
  from public.calendar_accounts
  where company_id = company and staff_id = p_staff_id;

  insert into public.calendar_tokens (account_id, refresh_token, access_token, token_expires_at)
  values (
    account,
    coalesce(nullif(p_refresh_token, ''), (select refresh_token from public.calendar_tokens where account_id = account)),
    p_access_token,
    p_token_expires_at
  )
  on conflict (account_id) do update
    set refresh_token = coalesce(nullif(excluded.refresh_token, ''), public.calendar_tokens.refresh_token),
        access_token = excluded.access_token,
        token_expires_at = excluded.token_expires_at;
end;
$$;

revoke all on function public.save_google_calendar_tokens(uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.save_google_calendar_tokens(uuid, text, text, text, text, timestamptz) to authenticated;

create or replace function public.google_calendar_credentials(target_staff_id uuid)
returns table (
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  google_email text,
  google_calendar_id text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_staff_calendar(target_staff_id) then
    raise exception 'Not allowed to read that calendar';
  end if;
  return query
    select
      t.refresh_token,
      t.access_token,
      t.token_expires_at,
      a.google_email,
      a.google_calendar_id
    from public.calendar_accounts a
    join public.calendar_tokens t on t.account_id = a.id
    where a.staff_id = target_staff_id
      and a.company_id = public.current_company_id()
      and a.linked = true
      and a.source = 'google';
end;
$$;

revoke all on function public.google_calendar_credentials(uuid) from public;
grant execute on function public.google_calendar_credentials(uuid) to authenticated;

create or replace function public.disconnect_google_calendar(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_staff_id() is distinct from p_staff_id and not public.current_is_company_admin() then
    raise exception 'You can only disconnect your own Google Calendar';
  end if;
  delete from public.calendar_tokens t
    using public.calendar_accounts a
    where t.account_id = a.id
      and a.staff_id = p_staff_id
      and a.company_id = public.current_company_id();
  update public.calendar_accounts
    set linked = false,
        google_email = '',
        linked_at = null,
        source = 'demo'
    where staff_id = p_staff_id
      and company_id = public.current_company_id();
end;
$$;

revoke all on function public.disconnect_google_calendar(uuid) from public;
grant execute on function public.disconnect_google_calendar(uuid) to authenticated;

-- ========== 20260819240000_training.sql ==========
-- Training progress per seat, plus company training bulletins.

create table if not exists public.training_progress (
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  read jsonb not null default '{}'::jsonb,
  badges jsonb not null default '{}'::jsonb,
  attempts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (company_id, staff_id)
);

create table if not exists public.training_bulletins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  body text not null default '',
  author text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists training_bulletins_company_idx on public.training_bulletins (company_id, created_at desc);

alter table public.training_progress enable row level security;
alter table public.training_bulletins enable row level security;

drop policy if exists "company isolation" on public.training_progress;
create policy "company isolation" on public.training_progress
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.training_bulletins;
create policy "company isolation" on public.training_bulletins
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ========== 20260819250000_lead_intake.sql ==========
-- Lead intake: source, referred-by contact, and job-site address on pursuits.

alter table public.opportunities
  add column if not exists lead_source text not null default '',
  add column if not exists referral_contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists notes text not null default '';

create index if not exists opportunities_referral_contact_idx
  on public.opportunities (referral_contact_id)
  where referral_contact_id is not null;

-- ========== 20260819260000_profile_staff.sql ==========
-- Tie each signed-in profile to its own team_members seat so login never
-- falls back onto a sample company_admin (Jordan Hale).

alter table public.profiles
  add column if not exists staff_id uuid references public.team_members (id) on delete set null;

create index if not exists profiles_staff_id_idx on public.profiles (staff_id);

insert into public.team_members (company_id, name, title, role, initials)
select p.company_id, p.full_name, p.title, p.role, p.initials
from public.profiles p
where not exists (
  select 1
  from public.team_members tm
  where tm.company_id = p.company_id
    and lower(tm.name) = lower(p.full_name)
);

update public.profiles p
set staff_id = tm.id
from public.team_members tm
where p.staff_id is null
  and tm.company_id = p.company_id
  and lower(tm.name) = lower(p.full_name);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  new_staff_id uuid;
  full_name text;
  title text;
  company_name text;
  initials text;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  title := coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), 'Company admin');
  company_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company'), ''), 'Northline Construction');
  initials := upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), '');

  insert into public.companies (name)
  values (company_name)
  returning id into new_company_id;

  insert into public.team_members (company_id, name, title, role, initials)
  values (new_company_id, full_name, title, 'company_admin', initials)
  returning id into new_staff_id;

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (
    new.id,
    new_company_id,
    full_name,
    title,
    initials,
    'company_admin',
    new_staff_id
  );

  return new;
end;
$$;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.staff_id
      from public.profiles p
      where p.id = auth.uid()
        and p.staff_id is not null
    ),
    (
      select tm.id
      from public.profiles p
      join public.team_members tm
        on tm.company_id = p.company_id
       and lower(tm.name) = lower(p.full_name)
      where p.id = auth.uid()
      limit 1
    )
  )
$$;

-- ========== 20260819270000_job_overview.sql ==========
-- Job overview: address, crew, tags, related people, and custom fields
-- so the job record can carry the field/production flow.

alter table public.jobs
  add column if not exists description text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists sales_rep text not null default '',
  add column if not exists assigned text[] not null default '{}',
  add column if not exists subcontractor_ids uuid[] not null default '{}',
  add column if not exists related_contact_ids uuid[] not null default '{}',
  add column if not exists custom_fields jsonb not null default '[]'::jsonb,
  add column if not exists project_type public.project_type,
  add column if not exists lead_source text not null default '';

-- ========== 20260819280000_nullable_company.sql ==========
-- Homeowners, trades, and DTC jobs do not need a company on file.
-- Repeats 20260819200000 so a project that never ran that file can still seed.

alter table public.contacts
  alter column client_id drop not null;

alter table public.contacts
  drop constraint if exists contacts_client_id_fkey;

alter table public.contacts
  add constraint contacts_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

alter table public.opportunities
  alter column client_id drop not null;

alter table public.jobs
  alter column client_id drop not null;

alter table public.estimates
  alter column client_id drop not null;

alter table public.invoices
  alter column client_id drop not null;

-- ========== 20260819290000_estimate_writer.sql ==========
-- Joist-style estimate writing: tax, discount, deposit, terms, sections, optional lines.

alter table public.estimates
  add column if not exists contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists tax_rate numeric(6, 3) not null default 0,
  add column if not exists discount_kind text not null default 'percent',
  add column if not exists discount_value numeric(14, 2) not null default 0,
  add column if not exists deposit_kind text not null default 'percent',
  add column if not exists deposit_value numeric(14, 2) not null default 0,
  add column if not exists intro text not null default '',
  add column if not exists terms text not null default '',
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '';

alter table public.estimate_lines
  add column if not exists title text not null default '',
  add column if not exists group_name text not null default '',
  add column if not exists optional boolean not null default false,
  add column if not exists selected boolean not null default true,
  add column if not exists taxable boolean not null default true;

update public.estimate_lines
set title = description
where title = '' and description <> '';

-- ========== 20260819300000_share_tokens.sql ==========
-- Client share links for estimates and invoices.

alter table public.estimates
  add column if not exists share_token text not null default '';

alter table public.invoices
  add column if not exists share_token text not null default '';

update public.estimates
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token = '';

update public.invoices
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token = '';

create unique index if not exists estimates_share_token_idx
  on public.estimates (share_token)
  where share_token <> '';

create unique index if not exists invoices_share_token_idx
  on public.invoices (share_token)
  where share_token <> '';

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
      'licenseNumber', coalesce(company.license_number, '')
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
      'taxRate', est.tax_rate,
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
      'licenseNumber', coalesce(company.license_number, '')
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

revoke all on function public.shared_estimate(text) from public;
revoke all on function public.shared_invoice(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;
grant execute on function public.shared_invoice(text) to anon, authenticated;

-- ========== 20260819310000_ensure_residential_enums.sql ==========
-- Ensure residential delivery, project, and client enum values exist.
-- Safe to re-run. The original 20260819200000 file already adds these; this
-- covers projects that applied later migrations without that one.

alter type public.project_type add value if not exists 'restoration';
alter type public.project_type add value if not exists 'remodel';
alter type public.project_type add value if not exists 'roofing';
alter type public.project_type add value if not exists 'exterior';
alter type public.project_type add value if not exists 'addition';

alter type public.delivery_method add value if not exists 'insurance_claim';
alter type public.delivery_method add value if not exists 'fixed_price';
alter type public.delivery_method add value if not exists 'time_and_materials';

alter type public.client_type add value if not exists 'insurance';
alter type public.client_type add value if not exists 'realtor';
alter type public.client_type add value if not exists 'trade_partner';

-- ========== 20260819320000_sign_shared_estimate.sql ==========
-- Homeowner can sign a shared estimate: accept it, move the lead to awarded (Job Sold),
-- and open a precon job. Mirrors the office "Mark signed" path.

create or replace function public.sign_shared_estimate(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  opp public.opportunities%rowtype;
  job_id uuid;
  v_total numeric(14, 2);
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_taxable numeric(14, 2);
  v_code text;
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

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_subtotal
  from public.estimate_lines line
  where line.estimate_id = est.id
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  if coalesce(est.discount_kind, 'percent') = 'percent' then
    v_discount := round(v_subtotal * coalesce(est.discount_value, 0) / 100, 2);
  else
    v_discount := least(v_subtotal, coalesce(est.discount_value, 0));
  end if;
  v_discount := coalesce(v_discount, 0);

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_taxable
  from public.estimate_lines line
  where line.estimate_id = est.id
    and coalesce(line.taxable, true) = true
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  v_total := greatest(0, v_subtotal - v_discount);
  if v_subtotal > 0 then
    v_total := v_total + round(
      greatest(0, v_taxable - v_discount * (v_taxable / v_subtotal)) * coalesce(est.tax_rate, 0) / 100,
      2
    );
  end if;

  update public.estimates
  set status = 'accepted', accepted_at = coalesce(accepted_at, now())
  where id = est.id
  returning * into est;

  if est.opportunity_id is null then
    insert into public.opportunities (
      company_id,
      name,
      client_id,
      primary_contact_id,
      stage,
      value,
      location,
      project_type,
      delivery_method,
      estimator,
      win_probability,
      next_step,
      code
    ) values (
      est.company_id,
      est.name,
      est.client_id,
      est.contact_id,
      'awarded',
      v_total,
      trim(both ', ' from concat_ws(', ', nullif(est.street, ''), nullif(est.city, ''))),
      'restoration',
      'fixed_price',
      '',
      100,
      'Job sold. Start precon.',
      est.number
    )
    returning * into opp;

    update public.estimates
    set opportunity_id = opp.id
    where id = est.id
    returning * into est;
  else
    update public.opportunities
    set
      stage = 'awarded',
      win_probability = 100,
      value = v_total,
      next_step = 'Job sold. Start precon.'
    where id = est.opportunity_id
    returning * into opp;
  end if;

  select j.id into job_id
  from public.jobs j
  where j.opportunity_id = opp.id
  limit 1;

  if job_id is null then
    v_code := coalesce(nullif(opp.code, ''), est.number);
    insert into public.jobs (
      company_id,
      opportunity_id,
      name,
      client_id,
      primary_contact_id,
      status,
      contract_value,
      start_date,
      location,
      project_manager,
      superintendent,
      owner_staff_id,
      code
    ) values (
      est.company_id,
      opp.id,
      opp.name,
      opp.client_id,
      opp.primary_contact_id,
      'precon',
      v_total,
      current_date,
      opp.location,
      coalesce(opp.estimator, ''),
      '',
      opp.owner_staff_id,
      v_code
    )
    returning id into job_id;
  end if;

  if job_id is not null then
    update public.estimates set job_id = job_id where id = est.id;
  end if;

  return public.shared_estimate(trim(p_token));
end;
$$;

revoke all on function public.sign_shared_estimate(text) from public;
grant execute on function public.sign_shared_estimate(text) to anon, authenticated;

-- ========== 20260819340000_project_financials.sql ==========
-- Project financials: expenses with required receipts, QuickBooks entry queue, accounting seat.

alter type public.seat_role add value if not exists 'accountant';

alter table public.invoices
  add column if not exists qb_status text not null default 'not_in_qb';

alter table public.payments
  alter column invoice_id drop not null;

alter table public.payments
  add column if not exists job_id uuid references public.jobs (id) on delete set null,
  add column if not exists receipt_url text not null default '',
  add column if not exists receipt_storage_path text,
  add column if not exists qb_status text not null default 'not_in_qb',
  add column if not exists created_by text not null default '';

create index if not exists payments_job_id_idx on public.payments (job_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  job_id uuid references public.jobs (id) on delete set null,
  vendor text not null default '',
  account text not null default 'materials',
  amount numeric(14, 2) not null default 0,
  incurred_at date not null default current_date,
  method text not null default 'credit_card',
  memo text not null default '',
  receipt_url text not null,
  receipt_storage_path text,
  qb_status text not null default 'not_in_qb',
  extracted_by_ai boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create unique index if not exists expenses_company_number_idx on public.expenses (company_id, number);
create index if not exists expenses_job_id_idx on public.expenses (job_id);
create index if not exists expenses_qb_status_idx on public.expenses (company_id, qb_status);

alter table public.expenses enable row level security;

drop policy if exists "company isolation" on public.expenses;
create policy "company isolation" on public.expenses
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.expenses';
  exception
    when duplicate_object then null;
  end;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "public read receipts" on storage.objects;
create policy "public read receipts"
on storage.objects for select
to public
using (bucket_id = 'receipts');

drop policy if exists "company receipt files" on storage.objects;
create policy "company receipt files"
on storage.objects for all to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

-- ========== 20260820120000_opportunity_originator.sql ==========
-- Who sourced the lead stays on the record when it is assigned to production.

alter table public.opportunities
  add column if not exists originator_staff_id uuid references public.team_members (id) on delete set null;

update public.opportunities
set originator_staff_id = owner_staff_id
where originator_staff_id is null
  and owner_staff_id is not null;

create index if not exists opportunities_originator_staff_id_idx
  on public.opportunities (originator_staff_id);

-- ========== 20260820200000_account_management.sql ==========
-- Account management: invite teammates into an existing company, lock, and restrict.
-- Safe to re-run after a failed attempt.

alter table public.team_members
  add column if not exists email text not null default '',
  add column if not exists locked boolean not null default false,
  add column if not exists restricted boolean not null default false,
  add column if not exists invite_expires_at timestamptz;

create unique index if not exists team_members_company_email_idx
  on public.team_members (company_id, lower(email))
  where email <> '';

create table if not exists public.account_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  email text not null,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists account_invites_company_id_idx on public.account_invites (company_id);
create index if not exists account_invites_token_idx on public.account_invites (token);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'account_invites_staff_id_key'
  ) then
    alter table public.account_invites
      add constraint account_invites_staff_id_key unique (staff_id);
  end if;
end $$;

alter table public.profiles
  add column if not exists staff_id uuid references public.team_members (id) on delete set null;

create or replace function public.current_is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role = 'company_admin'
        and coalesce(tm.locked, false) = false
        and coalesce(tm.restricted, false) = false
      from public.profiles p
      left join public.team_members tm on tm.id = p.staff_id
      where p.id = auth.uid()
    ),
    false
  )
$$;

revoke all on function public.current_is_company_admin() from public;
grant execute on function public.current_is_company_admin() to authenticated;

alter table public.account_invites enable row level security;

drop policy if exists "admin manage invites" on public.account_invites;
create policy "admin manage invites" on public.account_invites
  for all to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin())
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

drop policy if exists "admin update company profiles" on public.profiles;
create policy "admin update company profiles" on public.profiles
  for update to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin())
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

drop policy if exists "admin delete company profiles" on public.profiles;
create policy "admin delete company profiles" on public.profiles
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_is_company_admin()
    and id is distinct from auth.uid()
  );

drop policy if exists "company isolation" on public.team_members;
drop policy if exists "read company seats" on public.team_members;
drop policy if exists "admin write seats" on public.team_members;
drop policy if exists "admin update seats" on public.team_members;
drop policy if exists "admin delete seats" on public.team_members;

drop policy if exists "read company seats" on public.team_members;
create policy "read company seats" on public.team_members
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "admin write seats" on public.team_members;
create policy "admin write seats" on public.team_members
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

drop policy if exists "admin update seats" on public.team_members;
create policy "admin update seats" on public.team_members
  for update to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin())
  with check (company_id = public.current_company_id() and public.current_is_company_admin());

drop policy if exists "admin delete seats" on public.team_members;
create policy "admin delete seats" on public.team_members
  for delete to authenticated
  using (company_id = public.current_company_id() and public.current_is_company_admin());

drop function if exists public.invite_preview(text);

create or replace function public.invite_preview(p_token text)
returns table (
  company_id uuid,
  company_name text,
  seat_name text,
  seat_title text,
  seat_role public.seat_role,
  email text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id,
    c.name,
    tm.name,
    tm.title,
    tm.role,
    i.email,
    i.expires_at
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  join public.companies c on c.id = i.company_id
  where i.token = p_token
    and i.expires_at > now()
    and tm.locked = false
  limit 1;
end;
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

create or replace function public.claim_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
  seat_title text;
  full_name text;
  v_initials text;
begin
  if uid is null then
    raise exception 'Sign in to accept this invite.';
  end if;

  select u.email, coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
    into user_email, full_name
  from auth.users u
  where u.id = uid;

  select i.company_id, i.staff_id, i.email, tm.role, tm.title
    into invite_company, invite_staff, invite_email, invite_role, seat_title
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  where i.token = p_token
    and i.expires_at > now()
    and tm.locked = false;

  if invite_company is null then
    raise exception 'That invite is missing or expired.';
  end if;

  if lower(invite_email) is distinct from lower(coalesce(user_email, '')) then
    raise exception 'Sign in with the email this invite was sent to.';
  end if;

  v_initials := upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), '');

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (uid, invite_company, full_name, seat_title, v_initials, invite_role, invite_staff)
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;

  update public.team_members
  set
    name = full_name,
    title = seat_title,
    initials = v_initials,
    email = coalesce(user_email, email),
    invite_expires_at = null,
    locked = false
  where id = invite_staff;

  delete from public.account_invites where staff_id = invite_staff;
  return invite_company;
end;
$$;

revoke all on function public.claim_invite(text) from public;
grant execute on function public.claim_invite(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  new_staff_id uuid;
  full_name text;
  title text;
  company_name text;
  v_initials text;
  invite_token text;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
begin
  -- Auth runs this as supabase_auth_admin. Turn off RLS so the invite row is visible.
  begin
    perform set_config('row_security', 'off', true);
  exception
    when others then null;
  end;

  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  title := coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), 'Company admin');
  company_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company'), ''), 'Truss');
  v_initials := upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), '');
  invite_token := nullif(trim(coalesce(
    new.raw_user_meta_data->>'invite_token',
    new.raw_user_meta_data->>'inviteToken',
    ''
  )), '');

  if invite_token is not null then
    select i.company_id, i.staff_id, i.email, tm.role
      into invite_company, invite_staff, invite_email, invite_role
    from public.account_invites i
    join public.team_members tm on tm.id = i.staff_id
    where i.token = invite_token
      and i.expires_at > now()
      and coalesce(tm.locked, false) = false;

    -- Do not RAISE here: GoTrue turns any exception into "Database error saving new user"
    -- and rolls back the Auth user. If the invite is missing or the email does not match,
    -- fall through and open a company; the signup page will call claim_invite next.
    if invite_company is not null
       and (
         nullif(trim(invite_email), '') is null
         or lower(trim(invite_email)) = lower(trim(coalesce(new.email, '')))
       ) then
    insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
    values (
      new.id,
      invite_company,
      full_name,
      coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), title),
      v_initials,
      invite_role,
      invite_staff
    )
    on conflict (id) do update
      set company_id = excluded.company_id,
          full_name = excluded.full_name,
          title = excluded.title,
          initials = excluded.initials,
          role = excluded.role,
          staff_id = excluded.staff_id;

    update public.team_members
    set
      name = full_name,
      title = coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), title),
      initials = v_initials,
      email = coalesce(new.email, email),
      invite_expires_at = null,
      locked = false
    where id = invite_staff;

    delete from public.account_invites where staff_id = invite_staff;
    return new;
    end if;
  end if;

  insert into public.companies (name)
  values (company_name)
  returning id into new_company_id;

  insert into public.team_members (company_id, name, title, role, initials, email)
  values (new_company_id, full_name, title, 'company_admin', v_initials, coalesce(new.email, ''))
  returning id into new_staff_id;

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (
    new.id,
    new_company_id,
    full_name,
    title,
    v_initials,
    'company_admin',
    new_staff_id
  )
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;

  return new;
exception
  when others then
    return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
alter function public.handle_new_user() reset row_security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant select, insert, update, delete on public.companies, public.profiles, public.team_members to supabase_auth_admin;
    grant select, insert, update, delete on public.account_invites to supabase_auth_admin;
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'drop policy if exists "auth admin invites" on public.account_invites';
    execute $p$create policy "auth admin invites" on public.account_invites
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin profiles" on public.profiles';
    execute $p$create policy "auth admin profiles" on public.profiles
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin seats" on public.team_members';
    execute $p$create policy "auth admin seats" on public.team_members
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin companies" on public.companies';
    execute $p$create policy "auth admin companies" on public.companies
      for all to supabase_auth_admin using (true) with check (true)$p$;
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.account_invites';
exception
  when duplicate_object then null;
end $$;

-- ========== 20260821010000_invite_signup.sql ==========
-- Safe to re-run. Unblocks invite signup ("Database error saving new user").
-- SET row_security = off on handle_new_user aborts Auth when the function is
-- still owned by supabase_auth_admin (CREATE OR REPLACE does not change owner).
-- Strip that setting and take ownership before recreating anything else.

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'alter function public.handle_new_user() reset row_security';
    execute 'alter function public.handle_new_user() owner to postgres';
  end if;
  if to_regprocedure('public.provision_auth_user(uuid, text, jsonb)') is not null then
    execute 'alter function public.provision_auth_user(uuid, text, jsonb) reset row_security';
    execute 'alter function public.provision_auth_user(uuid, text, jsonb) owner to postgres';
  end if;
  if to_regprocedure('public.claim_invite(text)') is not null then
    execute 'alter function public.claim_invite(text) reset row_security';
    execute 'alter function public.claim_invite(text) owner to postgres';
  end if;
  if to_regprocedure('public.invite_preview(text)') is not null then
    execute 'alter function public.invite_preview(text) reset row_security';
    execute 'alter function public.invite_preview(text) owner to postgres';
  end if;
end $$;

create or replace function public.provision_auth_user(
  p_id uuid,
  p_email text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  new_company_id uuid;
  new_staff_id uuid;
  v_full_name text;
  v_title text;
  v_company_name text;
  v_initials text;
  invite_token text;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
  old_company uuid;
begin
  begin
    perform set_config('row_security', 'off', true);
  exception
    when others then null;
  end;

  v_full_name := coalesce(
    nullif(trim(coalesce(p_meta->>'full_name', '')), ''),
    split_part(coalesce(p_email, ''), '@', 1),
    'Owner'
  );
  v_title := coalesce(nullif(trim(coalesce(p_meta->>'title', '')), ''), 'Company admin');
  v_company_name := coalesce(nullif(trim(coalesce(p_meta->>'company', '')), ''), 'Truss');
  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');
  invite_token := nullif(trim(coalesce(
    p_meta->>'invite_token',
    p_meta->>'inviteToken',
    ''
  )), '');

  if invite_token is not null then
    select i.company_id, i.staff_id, i.email, tm.role
      into invite_company, invite_staff, invite_email, invite_role
    from public.account_invites i
    join public.team_members tm on tm.id = i.staff_id
    where i.token = invite_token
      and i.expires_at > now()
      and coalesce(tm.locked, false) = false;

    if invite_company is not null
       and (
         nullif(trim(coalesce(invite_email, '')), '') is null
         or lower(trim(invite_email)) = lower(trim(coalesce(p_email, '')))
       ) then
      insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
      values (
        p_id,
        invite_company,
        v_full_name,
        v_title,
        v_initials,
        invite_role,
        invite_staff
      )
      on conflict (id) do update
        set company_id = excluded.company_id,
            full_name = excluded.full_name,
            title = excluded.title,
            initials = excluded.initials,
            role = excluded.role,
            staff_id = excluded.staff_id;

      update public.team_members tm
      set
        name = v_full_name,
        title = v_title,
        initials = v_initials,
        email = coalesce(p_email, tm.email),
        invite_expires_at = null,
        locked = false
      where tm.id = invite_staff;

      delete from public.account_invites where staff_id = invite_staff;
      return;
    end if;
  end if;

  select company_id into old_company
  from public.profiles
  where id = p_id;

  if old_company is not null then
    return;
  end if;

  insert into public.companies (name)
  values (v_company_name)
  returning id into new_company_id;

  insert into public.team_members (company_id, name, title, role, initials, email)
  values (new_company_id, v_full_name, v_title, 'company_admin', v_initials, coalesce(p_email, ''))
  returning id into new_staff_id;

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (
    p_id,
    new_company_id,
    v_full_name,
    v_title,
    v_initials,
    'company_admin',
    new_staff_id
  )
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;
end;
$$;

alter function public.provision_auth_user(uuid, text, jsonb) owner to postgres;
alter function public.provision_auth_user(uuid, text, jsonb) reset row_security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.provision_auth_user(new.id, new.email, new.raw_user_meta_data);
  exception
    when others then null;
  end;
  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
alter function public.handle_new_user() reset row_security;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.claim_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  uid uuid := auth.uid();
  user_email text;
  invite_company uuid;
  invite_staff uuid;
  invite_email text;
  invite_role public.seat_role;
  seat_title text;
  v_full_name text;
  v_initials text;
  old_company uuid;
begin
  begin
    perform set_config('row_security', 'off', true);
  exception
    when others then null;
  end;

  if uid is null then
    raise exception 'Sign in to accept this invite.';
  end if;

  select u.email,
         coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
    into user_email, v_full_name
  from auth.users u
  where u.id = uid;

  select i.company_id, i.staff_id, i.email, tm.role, tm.title
    into invite_company, invite_staff, invite_email, invite_role, seat_title
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  where i.token = p_token
    and i.expires_at > now()
    and coalesce(tm.locked, false) = false;

  if invite_company is null then
    raise exception 'That invite is missing or expired.';
  end if;

  if nullif(trim(coalesce(invite_email, '')), '') is not null
     and lower(trim(invite_email)) is distinct from lower(trim(coalesce(user_email, ''))) then
    raise exception 'Sign in with the email this invite was sent to.';
  end if;

  select company_id into old_company
  from public.profiles
  where id = uid;

  v_initials := upper(left(regexp_replace(v_full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  select uid, invite_company, v_full_name, seat_title, v_initials, invite_role, invite_staff
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        title = excluded.title,
        initials = excluded.initials,
        role = excluded.role,
        staff_id = excluded.staff_id;

  update public.team_members tm
  set
    name = v_full_name,
    title = seat_title,
    initials = v_initials,
    email = coalesce(user_email, tm.email),
    invite_expires_at = null,
    locked = false
  where tm.id = invite_staff;

  delete from public.account_invites where staff_id = invite_staff;

  if old_company is not null
     and old_company is distinct from invite_company
     and not exists (select 1 from public.profiles p where p.company_id = old_company)
     and not exists (select 1 from public.jobs j where j.company_id = old_company)
     and not exists (select 1 from public.contacts c where c.company_id = old_company)
     and not exists (select 1 from public.opportunities o where o.company_id = old_company) then
    begin
      delete from public.team_members where company_id = old_company;
      delete from public.companies where id = old_company;
    exception
      when others then null;
    end;
  end if;

  return invite_company;
end;
$$;

alter function public.claim_invite(text) owner to postgres;
alter function public.claim_invite(text) reset row_security;

drop function if exists public.invite_preview(text);

create or replace function public.invite_preview(p_token text)
returns table (
  company_id uuid,
  company_name text,
  seat_name text,
  seat_title text,
  seat_role public.seat_role,
  email text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as company_id,
    c.name as company_name,
    tm.name as seat_name,
    tm.title as seat_title,
    tm.role as seat_role,
    i.email,
    i.expires_at
  from public.account_invites i
  join public.team_members tm on tm.id = i.staff_id
  join public.companies c on c.id = i.company_id
  where i.token = p_token
    and i.expires_at > now()
    and coalesce(tm.locked, false) = false
  limit 1;
$$;

alter function public.invite_preview(text) owner to postgres;

revoke all on function public.provision_auth_user(uuid, text, jsonb) from public;
revoke all on function public.claim_invite(text) from public;
revoke all on function public.invite_preview(text) from public;

do $$
begin
  grant execute on function public.provision_auth_user(uuid, text, jsonb) to postgres;
  grant execute on function public.handle_new_user() to postgres;
  grant execute on function public.claim_invite(text) to authenticated;
  grant execute on function public.invite_preview(text) to anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant select, insert, update, delete on public.companies, public.profiles, public.team_members, public.account_invites to supabase_auth_admin;
    grant execute on function public.provision_auth_user(uuid, text, jsonb) to supabase_auth_admin;
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.provision_auth_user(uuid, text, jsonb) to service_role;
    grant execute on function public.handle_new_user() to service_role;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'drop policy if exists "auth admin invites" on public.account_invites';
    execute $p$create policy "auth admin invites" on public.account_invites
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin profiles" on public.profiles';
    execute $p$create policy "auth admin profiles" on public.profiles
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin seats" on public.team_members';
    execute $p$create policy "auth admin seats" on public.team_members
      for all to supabase_auth_admin using (true) with check (true)$p$;
    execute 'drop policy if exists "auth admin companies" on public.companies';
    execute $p$create policy "auth admin companies" on public.companies
      for all to supabase_auth_admin using (true) with check (true)$p$;
  end if;
end $$;

-- ========== 20260821140000_photo_reports.sql ==========
-- Photo reports: cover, photo grid, and text pages stored as JSON on the job.

create table if not exists public.photo_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  title text not null default '',
  pages jsonb not null default '[]'::jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photo_reports_job_id_idx on public.photo_reports (job_id);
create index if not exists photo_reports_company_id_idx on public.photo_reports (company_id);

alter table public.photo_reports enable row level security;

drop policy if exists "company isolation" on public.photo_reports;
create policy "company isolation" on public.photo_reports
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ========== 20260821160000_job_market.sql ==========
-- Residential vs commercial on leads and jobs. Residential estimates are not taxed.

alter table public.opportunities
  add column if not exists market text not null default 'residential';

alter table public.jobs
  add column if not exists market text not null default 'residential';

update public.opportunities
set market = 'commercial'
where project_type in (
  'commercial',
  'multifamily',
  'healthcare',
  'education',
  'industrial',
  'hospitality',
  'civic',
  'tenant_improvement'
);

update public.jobs j
set market = o.market
from public.opportunities o
where j.opportunity_id = o.id;

update public.jobs
set market = 'commercial'
where project_type in (
  'commercial',
  'multifamily',
  'healthcare',
  'education',
  'industrial',
  'hospitality',
  'civic',
  'tenant_improvement'
);

-- ========== 20260821170000_residential_share_tax.sql ==========
-- Residential estimates never collect tax, including anonymous share links.

update public.estimates e
set tax_rate = 0
where e.tax_rate <> 0
  and coalesce(
    (select j.market from public.jobs j where j.id = e.job_id),
    (select o.market from public.opportunities o where o.id = e.opportunity_id),
    'residential'
  ) <> 'commercial';

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
      'licenseNumber', coalesce(company.license_number, '')
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

-- ========== 20260821180000_company_logo.sql ==========
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

-- ========== 20260821190000_estimate_templates.sql ==========
-- Company estimate templates: reusable sections, lines, terms, and tax.

create table if not exists public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text not null default '',
  market text not null default 'residential',
  intro text not null default '',
  terms text not null default '',
  notes text not null default '',
  tax_rate numeric(6, 3) not null default 0,
  discount_kind text not null default 'percent',
  discount_value numeric(14, 2) not null default 0,
  deposit_kind text not null default 'percent',
  deposit_value numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_templates_company_id_idx on public.estimate_templates (company_id);

create table if not exists public.estimate_template_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  template_id uuid not null references public.estimate_templates (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  title text not null default '',
  description text not null default '',
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  group_name text not null default '',
  optional boolean not null default false,
  selected boolean not null default true,
  taxable boolean not null default true
);

create index if not exists estimate_template_lines_template_id_idx on public.estimate_template_lines (template_id);

alter table public.estimate_templates enable row level security;
alter table public.estimate_template_lines enable row level security;

drop policy if exists "company isolation" on public.estimate_templates;
create policy "company isolation" on public.estimate_templates
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.estimate_template_lines;
create policy "company isolation" on public.estimate_template_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
declare
  tbl text;
begin
  foreach tbl in array array['estimate_templates', 'estimate_template_lines']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- ========== 20260821200000_estimate_signature.sql ==========
-- Homeowner signature on an accepted estimate. Drawn on the share link or in the office,
-- stored on the estimate, and printed on the proposal PDF.

alter table public.estimates
  add column if not exists signature_name text not null default '',
  add column if not exists signature_image text not null default '';

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
      'shareToken', est.share_token,
      'signatureName', coalesce(est.signature_name, ''),
      'signatureImage', coalesce(est.signature_image, '')
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

drop function if exists public.sign_shared_estimate(text);

create or replace function public.sign_shared_estimate(
  p_token text,
  p_signer_name text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  opp public.opportunities%rowtype;
  v_job_id uuid;
  v_total numeric(14, 2);
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_taxable numeric(14, 2);
  v_code text;
  v_name text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;

  v_name := trim(coalesce(p_signer_name, ''));
  if length(v_name) < 2 then
    raise exception 'Signer name is required';
  end if;
  if p_signature is null
     or p_signature not like 'data:image/png;base64,%'
     or length(p_signature) < 100
     or length(p_signature) > 200000 then
    raise exception 'A drawn signature is required';
  end if;

  select * into est
  from public.estimates
  where share_token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status = 'declined' then
    return null;
  end if;

  if est.status = 'accepted' and coalesce(est.signature_image, '') <> '' then
    return public.shared_estimate(trim(p_token));
  end if;

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_subtotal
  from public.estimate_lines line
  where line.estimate_id = est.id
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  if coalesce(est.discount_kind, 'percent') = 'percent' then
    v_discount := round(v_subtotal * coalesce(est.discount_value, 0) / 100, 2);
  else
    v_discount := least(v_subtotal, coalesce(est.discount_value, 0));
  end if;
  v_discount := coalesce(v_discount, 0);

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_taxable
  from public.estimate_lines line
  where line.estimate_id = est.id
    and coalesce(line.taxable, true) = true
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  v_total := greatest(0, v_subtotal - v_discount);
  if v_subtotal > 0 then
    v_total := v_total + round(
      greatest(0, v_taxable - v_discount * (v_taxable / v_subtotal)) * coalesce(est.tax_rate, 0) / 100,
      2
    );
  end if;

  update public.estimates
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now()),
    signature_name = v_name,
    signature_image = p_signature
  where id = est.id
  returning * into est;

  if est.opportunity_id is null then
    insert into public.opportunities (
      company_id,
      name,
      client_id,
      primary_contact_id,
      stage,
      value,
      location,
      project_type,
      delivery_method,
      estimator,
      win_probability,
      next_step,
      code
    ) values (
      est.company_id,
      est.name,
      est.client_id,
      est.contact_id,
      'awarded',
      v_total,
      trim(both ', ' from concat_ws(', ', nullif(est.street, ''), nullif(est.city, ''))),
      'restoration',
      'fixed_price',
      '',
      100,
      'Job sold. Start precon.',
      est.number
    )
    returning * into opp;

    update public.estimates
    set opportunity_id = opp.id
    where id = est.id
    returning * into est;
  else
    update public.opportunities
    set
      stage = 'awarded',
      win_probability = 100,
      value = v_total,
      next_step = 'Job sold. Start precon.'
    where id = est.opportunity_id
    returning * into opp;
  end if;

  select j.id into v_job_id
  from public.jobs j
  where j.opportunity_id = opp.id
  limit 1;

  if v_job_id is null then
    v_code := coalesce(nullif(opp.code, ''), est.number);
    insert into public.jobs (
      company_id,
      opportunity_id,
      name,
      client_id,
      primary_contact_id,
      status,
      contract_value,
      start_date,
      location,
      project_manager,
      superintendent,
      owner_staff_id,
      code
    ) values (
      est.company_id,
      opp.id,
      opp.name,
      opp.client_id,
      opp.primary_contact_id,
      'precon',
      v_total,
      current_date,
      opp.location,
      coalesce(opp.estimator, ''),
      '',
      opp.owner_staff_id,
      v_code
    )
    returning id into v_job_id;
  else
    update public.jobs
    set contract_value = v_total
    where id = v_job_id;
  end if;

  if v_job_id is not null then
    update public.estimates set job_id = v_job_id where id = est.id;
  end if;

  return public.shared_estimate(trim(p_token));
end;
$$;

revoke all on function public.sign_shared_estimate(text, text, text) from public;
grant execute on function public.sign_shared_estimate(text, text, text) to anon, authenticated;

-- ========== 20260821210000_one_job_per_lead.sql ==========
-- One costing job per lead. Opening a lead and the "fill missing jobs" pass
-- were racing and inserting two cards with the same code.

create temporary table if not exists truss_job_dupes (
  extra_id uuid primary key,
  keep_id uuid not null
);

delete from truss_job_dupes;

insert into truss_job_dupes (extra_id, keep_id)
select extra.id, keeper.keep_id
from public.jobs extra
join (
  select
    opportunity_id,
    (array_agg(id order by contract_value desc, created_at, id))[1] as keep_id
  from public.jobs
  where opportunity_id is not null
  group by opportunity_id
  having count(*) > 1
) keeper on keeper.opportunity_id = extra.opportunity_id
where extra.id <> keeper.keep_id;

update public.estimates e
set job_id = d.keep_id
from truss_job_dupes d
where e.job_id = d.extra_id;

update public.invoices i
set job_id = d.keep_id
from truss_job_dupes d
where i.job_id = d.extra_id;

update public.payments p
set job_id = d.keep_id
from truss_job_dupes d
where p.job_id = d.extra_id;

update public.expenses x
set job_id = d.keep_id
from truss_job_dupes d
where x.job_id = d.extra_id;

update public.schedule_events s
set job_id = d.keep_id
from truss_job_dupes d
where s.job_id = d.extra_id;

update public.job_photos p
set job_id = d.keep_id
from truss_job_dupes d
where p.job_id = d.extra_id;

update public.photo_reports r
set job_id = d.keep_id
from truss_job_dupes d
where r.job_id = d.extra_id;

update public.tasks t
set related_id = d.keep_id
from truss_job_dupes d
where t.related_type = 'job'
  and t.related_id = d.extra_id;

delete from public.jobs
where id in (select extra_id from truss_job_dupes);

drop table if exists truss_job_dupes;

create unique index if not exists jobs_one_per_opportunity_idx
  on public.jobs (opportunity_id)
  where opportunity_id is not null;

-- ========== 20260821220000_job_soft_delete.sql ==========
-- Company admins can move a job to Deleted with a required reason.
-- The row stays so it can be restored. Activity type "audit" is the trail.

alter table public.jobs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text not null default '',
  add column if not exists deleted_by text not null default '';

create index if not exists jobs_company_deleted_idx
  on public.jobs (company_id, deleted_at);

alter type public.activity_type add value if not exists 'audit';

-- ========== 20260821230000_job_photo_created_by.sql ==========
-- Who took a job photo, so the company Photos feed can show a name on each thumbnail.
-- Job access stays scoped; photos are visible to every seat in the company.

alter table public.job_photos
  add column if not exists created_by text not null default '';

-- ========== 20260821240000_page_share_tokens.sql ==========
-- Client share links for Pages (photo reports sent as job documents).

alter table public.photo_reports
  add column if not exists share_token text not null default '',
  add column if not exists template text not null default 'photos';

update public.photo_reports
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token = '';

create unique index if not exists photo_reports_share_token_idx
  on public.photo_reports (share_token)
  where share_token <> '';

create or replace function public.shared_page(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.photo_reports%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  contact_name text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  select * into report
  from public.photo_reports
  where share_token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = report.job_id;
  if not found then
    return null;
  end if;
  select * into company from public.companies where id = report.company_id;
  select name into contact_name from public.contacts where id = job.primary_contact_id;
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
    'report', jsonb_build_object(
      'id', report.id,
      'jobId', report.job_id,
      'title', report.title,
      'pages', report.pages,
      'template', coalesce(nullif(report.template, ''), 'photos'),
      'shareToken', report.share_token,
      'createdAt', report.created_at,
      'updatedAt', report.updated_at,
      'createdBy', report.created_by
    ),
    'job', jsonb_build_object(
      'id', job.id,
      'code', job.code,
      'name', job.name,
      'clientId', job.client_id,
      'opportunityId', job.opportunity_id,
      'primaryContactId', job.primary_contact_id,
      'relatedContactIds', to_jsonb(coalesce(job.related_contact_ids, '{}'::uuid[])),
      'ownerStaffId', job.owner_staff_id,
      'projectManager', job.project_manager,
      'projectType', job.project_type,
      'street', job.street,
      'city', job.city,
      'state', job.state,
      'postalCode', job.postal_code,
      'location', job.location,
      'customFields', coalesce(job.custom_fields, '[]'::jsonb)
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', photo.id,
        'jobId', photo.job_id,
        'caption', photo.caption,
        'category', photo.category,
        'takenAt', photo.taken_at,
        'imageUrl', photo.image_url,
        'storagePath', photo.storage_path,
        'createdBy', photo.created_by
      ) order by photo.taken_at)
      from public.job_photos photo
      where photo.job_id = job.id
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'title', c.title,
        'phone', c.phone
      ))
      from public.contacts c
      where c.id = job.primary_contact_id
         or c.id = any (coalesce(job.related_contact_ids, '{}'::uuid[]))
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'title', m.title
      ))
      from public.team_members m
      where m.company_id = report.company_id
        and (
          m.name = report.created_by
          or m.id = job.owner_staff_id
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shared_page(text) from public;
grant execute on function public.shared_page(text) to anon, authenticated;

-- Two-way texts (Sendblue) logged on the related job as communication.

alter type public.activity_type add value if not exists 'text';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  direction text not null default 'outbound',
  phone text not null default '',
  body text not null default '',
  handle text not null default '',
  status text not null default 'sent',
  media_url text not null default '',
  created_at timestamptz not null default now(),
  created_by text not null default '',
  constraint messages_direction_check check (direction in ('inbound', 'outbound'))
);

create index if not exists messages_company_created_idx on public.messages (company_id, created_at desc);
create index if not exists messages_job_id_idx on public.messages (job_id);
create index if not exists messages_contact_id_idx on public.messages (contact_id);
create unique index if not exists messages_company_handle_idx
  on public.messages (company_id, handle)
  where handle <> '';

alter table public.messages enable row level security;

drop policy if exists "company isolation" on public.messages;
create policy "company isolation" on public.messages
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.messages';
  exception
    when duplicate_object then null;
  end;
end $$;

create or replace function public.phone_last10(value text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(value, ''), '\D', '', 'g'), 10);
$$;

create or replace function public.ingest_inbound_text(
  p_from text,
  p_body text,
  p_handle text default '',
  p_media_url text default '',
  p_sent_at text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_contact public.contacts%rowtype;
  v_job public.jobs%rowtype;
  v_opp_id uuid;
  v_message public.messages%rowtype;
  v_author text;
  v_body text;
  v_created timestamptz;
  v_activity_type public.activity_type;
begin
  v_digits := public.phone_last10(p_from);
  if length(v_digits) < 10 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'bad_phone');
  end if;

  v_body := trim(coalesce(p_body, ''));
  if v_body = '' and trim(coalesce(p_media_url, '')) <> '' then
    v_body := '(photo or attachment)';
  end if;
  if v_body = '' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'empty');
  end if;

  v_created := now();
  begin
    if coalesce(trim(p_sent_at), '') <> '' then
      v_created := p_sent_at::timestamptz;
    end if;
  exception
    when others then
      v_created := now();
  end;

  select c.*
  into v_contact
  from public.contacts c
  where public.phone_last10(c.phone) = v_digits
  order by (
    select max(j.start_date)
    from public.jobs j
    where j.company_id = c.company_id
      and j.deleted_at is null
      and (
        j.primary_contact_id = c.id
        or c.id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
        or exists (
          select 1 from public.opportunities o
          where o.id = j.opportunity_id and o.primary_contact_id = c.id
        )
      )
  ) desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_contact');
  end if;

  if coalesce(p_handle, '') <> '' then
    select * into v_message
    from public.messages
    where company_id = v_contact.company_id and handle = p_handle
    limit 1;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_message.id);
    end if;
  end if;

  select j.*
  into v_job
  from public.jobs j
  where j.company_id = v_contact.company_id
    and j.deleted_at is null
    and (
      j.primary_contact_id = v_contact.id
      or v_contact.id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
      or exists (
        select 1 from public.opportunities o
        where o.id = j.opportunity_id and o.primary_contact_id = v_contact.id
      )
    )
  order by
    case j.status
      when 'in_progress' then 0
      when 'punch' then 1
      when 'precon' then 2
      when 'on_hold' then 3
      else 4
    end,
    j.start_date desc nulls last
  limit 1;

  if v_job.id is null then
    select o.id
    into v_opp_id
    from public.opportunities o
    where o.company_id = v_contact.company_id
      and o.primary_contact_id = v_contact.id
      and o.stage <> 'lost'
    order by o.created_at desc
    limit 1;
  else
    v_opp_id := v_job.opportunity_id;
  end if;

  insert into public.messages (
    company_id,
    contact_id,
    job_id,
    opportunity_id,
    direction,
    phone,
    body,
    handle,
    status,
    media_url,
    created_at,
    created_by
  ) values (
    v_contact.company_id,
    v_contact.id,
    v_job.id,
    v_opp_id,
    'inbound',
    coalesce(nullif(trim(p_from), ''), v_contact.phone),
    v_body,
    coalesce(p_handle, ''),
    'received',
    coalesce(p_media_url, ''),
    v_created,
    v_contact.name
  )
  returning * into v_message;

  v_author := coalesce(nullif(trim(v_contact.name), ''), 'Homeowner');
  begin
    v_activity_type := 'text';
  exception
    when invalid_text_representation then
      v_activity_type := 'call';
  end;

  if v_job.id is not null then
    insert into public.activities (
      company_id,
      entity_type,
      entity_id,
      type,
      body,
      author,
      created_at
    ) values (
      v_contact.company_id,
      'job',
      v_job.id,
      v_activity_type,
      format('%s texted:%s%s', v_author, chr(10), v_body),
      v_author,
      v_created
    );
  elsif v_opp_id is not null then
    insert into public.activities (
      company_id,
      entity_type,
      entity_id,
      type,
      body,
      author,
      created_at
    ) values (
      v_contact.company_id,
      'opportunity',
      v_opp_id,
      v_activity_type,
      format('%s texted:%s%s', v_author, chr(10), v_body),
      v_author,
      v_created
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_message.id,
    'jobId', v_message.job_id,
    'contactId', v_message.contact_id
  );
end;
$$;

grant select, insert, update, delete on public.messages to authenticated;

revoke all on function public.ingest_inbound_text(text, text, text, text, text) from public;
grant execute on function public.ingest_inbound_text(text, text, text, text, text) to anon, authenticated;
grant execute on function public.phone_last10(text) to anon, authenticated;

-- ========== 20260825130000_document_terms.sql ==========
-- Company default terms for new estimates and invoices, plus per-invoice terms.

alter table public.companies
  add column if not exists default_estimate_terms text,
  add column if not exists default_invoice_terms text;

alter table public.invoices
  add column if not exists terms text not null default '';

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

-- ========== 20260825140000_document_project_manager.sql ==========
-- Job owner (project manager) contact on shared estimates and invoices.

create or replace function public.document_project_manager(
  p_company_id uuid,
  p_job_id uuid,
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  job public.jobs%rowtype;
  opp public.opportunities%rowtype;
  pm public.team_members%rowtype;
  company_phone text;
  pm_name text;
begin
  if p_job_id is not null then
    select * into job from public.jobs where id = p_job_id;
  end if;
  if coalesce(p_opportunity_id, job.opportunity_id) is not null then
    select * into opp from public.opportunities where id = coalesce(p_opportunity_id, job.opportunity_id);
  end if;
  select phone into company_phone from public.companies where id = p_company_id;

  if coalesce(job.owner_staff_id, opp.owner_staff_id) is not null then
    select * into pm
    from public.team_members
    where id = coalesce(job.owner_staff_id, opp.owner_staff_id);
  end if;
  if pm.id is null then
    select * into pm
    from public.team_members
    where company_id = p_company_id
      and lower(name) = lower(coalesce(nullif(job.project_manager, ''), nullif(job.sales_rep, ''), nullif(opp.estimator, '')))
    limit 1;
  end if;

  pm_name := coalesce(
    nullif(pm.name, ''),
    nullif(job.project_manager, ''),
    nullif(job.sales_rep, ''),
    nullif(opp.estimator, '')
  );
  if pm_name is null or pm_name = '' then
    return null;
  end if;
  return jsonb_build_object(
    'name', pm_name,
    'title', coalesce(nullif(pm.title, ''), 'Project Manager'),
    'email', coalesce(pm.email, ''),
    'phone', coalesce(company_phone, '')
  );
end;
$$;

revoke all on function public.document_project_manager(uuid, uuid, uuid) from public;

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
      'notes', '',
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
      'intro', est.intro,
      'terms', est.terms,
      'street', est.street,
      'city', est.city,
      'state', est.state,
      'postalCode', est.postal_code,
      'shareToken', est.share_token,
      'signatureName', coalesce(est.signature_name, ''),
      'signatureImage', coalesce(est.signature_image, '')
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
      'notes', '',
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

-- ========== 20260825150000_fix_sign_shared_estimate_job_id.sql ==========
-- Signing a shared estimate failed with: column reference "job_id" is ambiguous.
-- The PL/pgSQL variable was named job_id, same as estimates.job_id, so
--   update public.estimates set job_id = job_id
-- could not tell the column from the variable.

create or replace function public.sign_shared_estimate(
  p_token text,
  p_signer_name text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  opp public.opportunities%rowtype;
  v_job_id uuid;
  v_total numeric(14, 2);
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_taxable numeric(14, 2);
  v_code text;
  v_name text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;

  v_name := trim(coalesce(p_signer_name, ''));
  if length(v_name) < 2 then
    raise exception 'Signer name is required';
  end if;
  if p_signature is null
     or p_signature not like 'data:image/png;base64,%'
     or length(p_signature) < 100
     or length(p_signature) > 200000 then
    raise exception 'A drawn signature is required';
  end if;

  select * into est
  from public.estimates
  where share_token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status = 'declined' then
    return null;
  end if;

  if est.status = 'accepted' and coalesce(est.signature_image, '') <> '' then
    return public.shared_estimate(trim(p_token));
  end if;

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_subtotal
  from public.estimate_lines line
  where line.estimate_id = est.id
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  if coalesce(est.discount_kind, 'percent') = 'percent' then
    v_discount := round(v_subtotal * coalesce(est.discount_value, 0) / 100, 2);
  else
    v_discount := least(v_subtotal, coalesce(est.discount_value, 0));
  end if;
  v_discount := coalesce(v_discount, 0);

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_taxable
  from public.estimate_lines line
  where line.estimate_id = est.id
    and coalesce(line.taxable, true) = true
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  v_total := greatest(0, v_subtotal - v_discount);
  if v_subtotal > 0 then
    v_total := v_total + round(
      greatest(0, v_taxable - v_discount * (v_taxable / v_subtotal)) * coalesce(est.tax_rate, 0) / 100,
      2
    );
  end if;

  update public.estimates
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now()),
    signature_name = v_name,
    signature_image = p_signature
  where id = est.id
  returning * into est;

  if est.opportunity_id is null then
    insert into public.opportunities (
      company_id,
      name,
      client_id,
      primary_contact_id,
      stage,
      value,
      location,
      project_type,
      delivery_method,
      estimator,
      win_probability,
      next_step,
      code
    ) values (
      est.company_id,
      est.name,
      est.client_id,
      est.contact_id,
      'awarded',
      v_total,
      trim(both ', ' from concat_ws(', ', nullif(est.street, ''), nullif(est.city, ''))),
      'restoration',
      'fixed_price',
      '',
      100,
      'Job sold. Start precon.',
      est.number
    )
    returning * into opp;

    update public.estimates
    set opportunity_id = opp.id
    where id = est.id
    returning * into est;
  else
    update public.opportunities
    set
      stage = 'awarded',
      win_probability = 100,
      value = v_total,
      next_step = 'Job sold. Start precon.'
    where id = est.opportunity_id
    returning * into opp;
  end if;

  select j.id into v_job_id
  from public.jobs j
  where j.opportunity_id = opp.id
  limit 1;

  if v_job_id is null then
    v_code := coalesce(nullif(opp.code, ''), est.number);
    insert into public.jobs (
      company_id,
      opportunity_id,
      name,
      client_id,
      primary_contact_id,
      status,
      contract_value,
      start_date,
      location,
      project_manager,
      superintendent,
      owner_staff_id,
      code
    ) values (
      est.company_id,
      opp.id,
      opp.name,
      opp.client_id,
      opp.primary_contact_id,
      'precon',
      v_total,
      current_date,
      opp.location,
      coalesce(opp.estimator, ''),
      '',
      opp.owner_staff_id,
      v_code
    )
    returning id into v_job_id;
  else
    update public.jobs
    set contract_value = v_total
    where id = v_job_id;
  end if;

  if v_job_id is not null then
    update public.estimates set job_id = v_job_id where id = est.id;
  end if;

  return public.shared_estimate(trim(p_token));
end;
$$;

revoke all on function public.sign_shared_estimate(text, text, text) from public;
grant execute on function public.sign_shared_estimate(text, text, text) to anon, authenticated;

-- ========== 20260825160000_staff_profile_phone.sql ==========
-- Per-seat profile phone so estimates and invoices can print a direct line.
-- Also lets a teammate update their own name, title, and phone.

alter table public.team_members
  add column if not exists phone text not null default '';

drop policy if exists "update own seat profile" on public.team_members;
create policy "update own seat profile" on public.team_members
  for update to authenticated
  using (id = public.current_staff_id() and company_id = public.current_company_id())
  with check (id = public.current_staff_id() and company_id = public.current_company_id());

create or replace function public.protect_team_member_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if public.current_is_company_admin() then
    return new;
  end if;
  new.role := old.role;
  new.locked := old.locked;
  new.restricted := old.restricted;
  new.email := old.email;
  new.invite_expires_at := old.invite_expires_at;
  new.team_id := old.team_id;
  new.company_id := old.company_id;
  return new;
end;
$$;

drop trigger if exists protect_team_member_admin_fields on public.team_members;
create trigger protect_team_member_admin_fields
  before update on public.team_members
  for each row execute function public.protect_team_member_admin_fields();

create or replace function public.document_project_manager(
  p_company_id uuid,
  p_job_id uuid,
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  job public.jobs%rowtype;
  opp public.opportunities%rowtype;
  pm public.team_members%rowtype;
  company_phone text;
  pm_name text;
begin
  if p_job_id is not null then
    select * into job from public.jobs where id = p_job_id;
  end if;
  if coalesce(p_opportunity_id, job.opportunity_id) is not null then
    select * into opp from public.opportunities where id = coalesce(p_opportunity_id, job.opportunity_id);
  end if;
  select phone into company_phone from public.companies where id = p_company_id;

  if coalesce(job.owner_staff_id, opp.owner_staff_id) is not null then
    select * into pm
    from public.team_members
    where id = coalesce(job.owner_staff_id, opp.owner_staff_id);
  end if;
  if pm.id is null then
    select * into pm
    from public.team_members
    where company_id = p_company_id
      and lower(name) = lower(coalesce(nullif(job.project_manager, ''), nullif(job.sales_rep, ''), nullif(opp.estimator, '')))
    limit 1;
  end if;

  pm_name := coalesce(
    nullif(pm.name, ''),
    nullif(job.project_manager, ''),
    nullif(job.sales_rep, ''),
    nullif(opp.estimator, '')
  );
  if pm_name is null or pm_name = '' then
    return null;
  end if;
  return jsonb_build_object(
    'name', pm_name,
    'title', coalesce(nullif(pm.title, ''), 'Project Manager'),
    'email', coalesce(pm.email, ''),
    'phone', coalesce(nullif(pm.phone, ''), company_phone, '')
  );
end;
$$;

revoke all on function public.document_project_manager(uuid, uuid, uuid) from public;

-- ========== 20260825170000_job_files.sql ==========
-- Attachments on a job: PDFs, insurance docs, and other files from the field.

create table if not exists public.job_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  storage_path text not null,
  url text not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists job_files_job_id_idx on public.job_files (job_id);
create index if not exists job_files_company_id_idx on public.job_files (company_id);

alter table public.job_files enable row level security;

drop policy if exists "company isolation" on public.job_files;
create policy "company isolation" on public.job_files
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.job_files to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.job_files';
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-files',
  'job-files',
  true,
  26214400,
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read job files" on storage.objects;
create policy "public read job files"
on storage.objects for select
to public
using (bucket_id = 'job-files');

drop policy if exists "company job files" on storage.objects;
create policy "company job files"
on storage.objects for all to authenticated
using (
  bucket_id = 'job-files'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'job-files'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

-- ========== 20260825181000_job_files_grants.sql ==========
grant select, insert, update, delete on table public.job_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-files',
  'job-files',
  true,
  26214400,
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read job files" on storage.objects;
create policy "public read job files"
on storage.objects for select
to public
using (bucket_id = 'job-files');

drop policy if exists "company job files" on storage.objects;
create policy "company job files"
on storage.objects for all to authenticated
using (
  bucket_id = 'job-files'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'job-files'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

-- ========== 20260825180000_estimate_signer_links.sql ==========
-- Unique signing links per homeowner, plus a second drawn signature.
-- Opening either link only lets that person sign their own line.
-- When a sent proposal is opened, the contractor is already marked signed.

alter table public.estimates
  add column if not exists second_share_token text not null default '';

alter table public.estimates
  add column if not exists second_signature_name text not null default '';

alter table public.estimates
  add column if not exists second_signature_image text not null default '';

update public.estimates
set second_share_token = replace(gen_random_uuid()::text, '-', '')
where second_contact_id is not null
  and coalesce(second_share_token, '') = '';

update public.estimates
set second_share_token = replace(gen_random_uuid()::text, '-', '')
where second_share_token <> ''
  and second_share_token = share_token;

create unique index if not exists estimates_second_share_token_idx
  on public.estimates (second_share_token)
  where second_share_token <> '';

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
      'notes', '',
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
      'secondSignatureImage', coalesce(est.second_signature_image, '')
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

create or replace function public.sign_shared_estimate(
  p_token text,
  p_signer_name text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  opp public.opportunities%rowtype;
  v_job_id uuid;
  v_total numeric(14, 2);
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_taxable numeric(14, 2);
  v_code text;
  v_name text;
  v_token text;
  v_role text;
  v_needs_second boolean;
  v_fully boolean;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);

  v_name := trim(coalesce(p_signer_name, ''));
  if length(v_name) < 2 then
    raise exception 'Signer name is required';
  end if;
  if p_signature is null
     or p_signature not like 'data:image/png;base64,%'
     or length(p_signature) < 100
     or length(p_signature) > 200000 then
    raise exception 'A drawn signature is required';
  end if;

  select * into est
  from public.estimates
  where share_token = v_token
     or (second_share_token <> '' and second_share_token = v_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status = 'declined' then
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

  v_needs_second := est.second_contact_id is not null;

  if v_role = 'second' and not v_needs_second then
    raise exception 'This proposal does not need a second signature';
  end if;

  if v_role = 'primary' and coalesce(est.signature_image, '') <> '' then
    return public.shared_estimate(v_token);
  end if;
  if v_role = 'second' and coalesce(est.second_signature_image, '') <> '' then
    return public.shared_estimate(v_token);
  end if;

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_subtotal
  from public.estimate_lines line
  where line.estimate_id = est.id
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  if coalesce(est.discount_kind, 'percent') = 'percent' then
    v_discount := round(v_subtotal * coalesce(est.discount_value, 0) / 100, 2);
  else
    v_discount := least(v_subtotal, coalesce(est.discount_value, 0));
  end if;
  v_discount := coalesce(v_discount, 0);

  select coalesce(sum(line.quantity * line.unit_cost), 0) into v_taxable
  from public.estimate_lines line
  where line.estimate_id = est.id
    and coalesce(line.taxable, true) = true
    and (coalesce(line.optional, false) = false or coalesce(line.selected, true) = true);

  v_total := greatest(0, v_subtotal - v_discount);
  if v_subtotal > 0 then
    v_total := v_total + round(
      greatest(0, v_taxable - v_discount * (v_taxable / v_subtotal)) * coalesce(est.tax_rate, 0) / 100,
      2
    );
  end if;

  if v_role = 'second' then
    update public.estimates
    set
      second_accepted_at = coalesce(second_accepted_at, now()),
      second_signature_name = v_name,
      second_signature_image = p_signature
    where id = est.id
    returning * into est;
  else
    update public.estimates
    set
      accepted_at = coalesce(accepted_at, now()),
      signature_name = v_name,
      signature_image = p_signature
    where id = est.id
    returning * into est;
  end if;

  v_fully := (coalesce(est.signature_image, '') <> '' or est.accepted_at is not null)
    and (
      not v_needs_second
      or coalesce(est.second_signature_image, '') <> ''
      or est.second_accepted_at is not null
    );

  if not v_fully then
    return public.shared_estimate(v_token);
  end if;

  update public.estimates
  set status = 'accepted'
  where id = est.id
  returning * into est;

  if est.opportunity_id is null then
    insert into public.opportunities (
      company_id,
      name,
      client_id,
      primary_contact_id,
      stage,
      value,
      location,
      project_type,
      delivery_method,
      estimator,
      win_probability,
      next_step,
      code
    ) values (
      est.company_id,
      est.name,
      est.client_id,
      est.contact_id,
      'awarded',
      v_total,
      trim(both ', ' from concat_ws(', ', nullif(est.street, ''), nullif(est.city, ''))),
      'restoration',
      'fixed_price',
      '',
      100,
      'Job sold. Start precon.',
      est.number
    )
    returning * into opp;

    update public.estimates
    set opportunity_id = opp.id
    where id = est.id
    returning * into est;
  else
    update public.opportunities
    set
      stage = 'awarded',
      win_probability = 100,
      value = v_total,
      next_step = 'Job sold. Start precon.'
    where id = est.opportunity_id
    returning * into opp;
  end if;

  select j.id into v_job_id
  from public.jobs j
  where j.opportunity_id = opp.id
  limit 1;

  if v_job_id is null then
    v_code := coalesce(nullif(opp.code, ''), est.number);
    insert into public.jobs (
      company_id,
      opportunity_id,
      name,
      client_id,
      primary_contact_id,
      status,
      contract_value,
      start_date,
      location,
      project_manager,
      superintendent,
      owner_staff_id,
      code
    ) values (
      est.company_id,
      opp.id,
      opp.name,
      opp.client_id,
      opp.primary_contact_id,
      'precon',
      v_total,
      current_date,
      opp.location,
      coalesce(opp.estimator, ''),
      '',
      opp.owner_staff_id,
      v_code
    )
    returning id into v_job_id;
  else
    update public.jobs
    set contract_value = v_total
    where id = v_job_id;
  end if;

  if v_job_id is not null then
    update public.estimates set job_id = v_job_id where id = est.id;
  end if;

  return public.shared_estimate(v_token);
end;
$$;

create or replace function public.select_shared_estimate_line(
  p_token text,
  p_line_id uuid,
  p_selected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  v_token text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  if p_line_id is null then
    raise exception 'Line is required';
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
  if est.status not in ('draft', 'sent', 'viewed') then
    return public.shared_estimate(v_token);
  end if;

  update public.estimate_lines
  set selected = coalesce(p_selected, true)
  where id = p_line_id
    and estimate_id = est.id
    and coalesce(optional, false) = true;

  return public.shared_estimate(v_token);
end;
$$;

revoke all on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;
revoke all on function public.sign_shared_estimate(text, text, text) from public;
grant execute on function public.sign_shared_estimate(text, text, text) to anon, authenticated;
revoke all on function public.select_shared_estimate_line(text, uuid, boolean) from public;
grant execute on function public.select_shared_estimate_line(text, uuid, boolean) to anon, authenticated;

-- ========== 20260825190000_share_link_sender.sql ==========
-- When a homeowner opens an expired or broken share link, still name the
-- contractor who sent it and give them a phone and email to reach.
-- Also keep shared estimates from 404-ing if project-manager lookup fails.

create or replace function public.document_project_manager(
  p_company_id uuid,
  p_job_id uuid,
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  job public.jobs%rowtype;
  opp public.opportunities%rowtype;
  pm public.team_members%rowtype;
  company_phone text;
  pm_name text;
begin
  if p_job_id is not null then
    select * into job from public.jobs where id = p_job_id;
  end if;
  if coalesce(p_opportunity_id, job.opportunity_id) is not null then
    select * into opp from public.opportunities where id = coalesce(p_opportunity_id, job.opportunity_id);
  end if;
  select phone into company_phone from public.companies where id = p_company_id;

  if coalesce(job.owner_staff_id, opp.owner_staff_id) is not null then
    select * into pm
    from public.team_members
    where id = coalesce(job.owner_staff_id, opp.owner_staff_id);
  end if;
  if pm.id is null then
    select * into pm
    from public.team_members
    where company_id = p_company_id
      and lower(name) = lower(coalesce(nullif(job.project_manager, ''), nullif(job.sales_rep, ''), nullif(opp.estimator, '')))
    limit 1;
  end if;

  pm_name := coalesce(
    nullif(pm.name, ''),
    nullif(job.project_manager, ''),
    nullif(job.sales_rep, ''),
    nullif(opp.estimator, '')
  );
  if pm_name is null or pm_name = '' then
    return null;
  end if;
  return jsonb_build_object(
    'name', pm_name,
    'title', coalesce(nullif(pm.title, ''), 'Project Manager'),
    'email', coalesce(pm.email, ''),
    'phone', coalesce(nullif(pm.phone, ''), company_phone, '')
  );
exception when others then
  return null;
end;
$$;

revoke all on function public.document_project_manager(uuid, uuid, uuid) from public;

create or replace function public.shared_link_sender(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text;
  v_company_id uuid;
  v_job_id uuid;
  v_opp_id uuid;
  company public.companies%rowtype;
  pm jsonb;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);

  select company_id, job_id, opportunity_id
    into v_company_id, v_job_id, v_opp_id
  from public.estimates
  where share_token = v_token
  limit 1;

  if v_company_id is null then
    begin
      execute $q$
        select company_id, job_id, opportunity_id
        from public.estimates
        where second_share_token <> '' and second_share_token = $1
        limit 1
      $q$ into v_company_id, v_job_id, v_opp_id using v_token;
    exception when undefined_column then
      null;
    end;
  end if;

  if v_company_id is null then
    select i.company_id, i.job_id, e.opportunity_id
      into v_company_id, v_job_id, v_opp_id
    from public.invoices i
    left join public.estimates e on e.id = i.estimate_id
    where i.share_token = v_token
    limit 1;
  end if;

  if v_company_id is null then
    begin
      select pr.company_id, pr.job_id, j.opportunity_id
        into v_company_id, v_job_id, v_opp_id
      from public.photo_reports pr
      left join public.jobs j on j.id = pr.job_id
      where pr.share_token = v_token
      limit 1;
    exception when undefined_table then
      null;
    end;
  end if;

  if v_company_id is null then
    return null;
  end if;

  select * into company from public.companies where id = v_company_id;
  if not found then
    return null;
  end if;

  begin
    pm := public.document_project_manager(v_company_id, v_job_id, v_opp_id);
  exception when others then
    pm := null;
  end;

  return jsonb_build_object(
    'company', jsonb_build_object(
      'name', coalesce(nullif(company.name, ''), 'Your contractor'),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, '')
    ),
    'projectManager', pm
  );
end;
$$;

revoke all on function public.shared_link_sender(text) from public;
grant execute on function public.shared_link_sender(text) to anon, authenticated;

-- ========== 20260825200000_estimate_line_photos.sql ==========
-- Attach job-gallery photos to estimate line items so they print on the
-- proposal, the client share link, and the PDF.

alter table public.estimate_lines
  add column if not exists photo_ids uuid[] not null default '{}';

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
      'notes', '',
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
      'secondSignatureImage', coalesce(est.second_signature_image, '')
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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;


-- ========== 20260825210000_qbwc.sql ==========
-- QuickBooks Web Connector: push approved (non-draft) invoices with line items
-- onto Customer:Job in QuickBooks Desktop so accounting does not retype them.
-- pgcrypto (crypt/gen_salt) lives in the extensions schema on hosted Supabase.

create extension if not exists pgcrypto;

create table if not exists public.qbwc_connectors (
  company_id uuid primary key references public.companies (id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  owner_id uuid not null default gen_random_uuid(),
  file_id uuid not null default gen_random_uuid(),
  default_item_name text not null default 'Contract work',
  enabled boolean not null default true,
  last_connected_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qbwc_sessions (
  ticket uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  step text not null default 'customer_query',
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qbwc_sessions_company_idx on public.qbwc_sessions (company_id, created_at desc);

alter table public.invoices
  add column if not exists qb_txn_id text not null default '';

alter table public.qbwc_connectors enable row level security;
alter table public.qbwc_sessions enable row level security;

drop policy if exists "company isolation" on public.qbwc_connectors;
create policy "company isolation" on public.qbwc_connectors
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "no client access" on public.qbwc_sessions;
create policy "no client access" on public.qbwc_sessions
  for all to authenticated
  using (false)
  with check (false);

create or replace function public.qbwc_upsert_connector(p_password text, p_item_name text default 'Contract work')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company uuid;
  v_row public.qbwc_connectors%rowtype;
  v_item text;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'Not signed in';
  end if;
  v_item := coalesce(nullif(trim(p_item_name), ''), 'Contract work');
  select * into v_row from public.qbwc_connectors where company_id = v_company;
  if not found then
    if coalesce(p_password, '') = '' then
      raise exception 'Set a Web Connector password';
    end if;
    insert into public.qbwc_connectors (company_id, username, password_hash, default_item_name)
    values (
      v_company,
      'truss_' || substr(replace(v_company::text, '-', ''), 1, 12),
      crypt(p_password, gen_salt('bf'::text)),
      v_item
    )
    returning * into v_row;
  else
    update public.qbwc_connectors
    set
      password_hash = case
        when coalesce(p_password, '') = '' then password_hash
        else crypt(p_password, gen_salt('bf'::text))
      end,
      default_item_name = v_item,
      enabled = true,
      updated_at = now()
    where company_id = v_company
    returning * into v_row;
  end if;
  return jsonb_build_object(
    'username', v_row.username,
    'ownerId', v_row.owner_id,
    'fileId', v_row.file_id,
    'itemName', v_row.default_item_name,
    'enabled', v_row.enabled,
    'lastConnectedAt', v_row.last_connected_at,
    'lastError', v_row.last_error
  );
end;
$$;

create or replace function public.qbwc_authenticate(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.qbwc_connectors%rowtype;
  v_ticket uuid;
begin
  if coalesce(p_username, '') = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  select * into v_row
  from public.qbwc_connectors
  where username = trim(p_username)
    and enabled
    and password_hash = crypt(p_password, password_hash)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  delete from public.qbwc_sessions where company_id = v_row.company_id;
  insert into public.qbwc_sessions (company_id)
  values (v_row.company_id)
  returning ticket into v_ticket;
  update public.qbwc_connectors
  set last_connected_at = now(), last_error = '', updated_at = now()
  where company_id = v_row.company_id;
  return jsonb_build_object('ok', true, 'ticket', v_ticket, 'companyId', v_row.company_id);
end;
$$;

create or replace function public.qbwc_pick_invoice(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select inv.id into v_id
  from public.invoices inv
  where inv.company_id = p_company
    and inv.qb_status = 'queued'
    and inv.status not in ('draft', 'void')
    and inv.job_id is not null
    and exists (
      select 1 from public.invoice_lines line where line.invoice_id = inv.id
    )
  order by inv.issued_at, inv.number
  limit 1;
  return v_id;
end;
$$;

create or replace function public.qbwc_invoice_payload(p_invoice uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  v_customer text;
  v_phone text;
  v_item text;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = inv.job_id;
  select * into company from public.companies where id = inv.company_id;
  select default_item_name into v_item from public.qbwc_connectors where company_id = inv.company_id;
  v_item := coalesce(nullif(trim(v_item), ''), 'Contract work');

  v_customer := coalesce(
    (select name from public.clients where id = inv.client_id),
    (select name from public.contacts where id = job.primary_contact_id),
    (select c.name
       from public.opportunities o
       join public.contacts c on c.id = o.primary_contact_id
      where o.id = job.opportunity_id),
    'Homeowner'
  );
  v_phone := coalesce(
    (select phone from public.contacts where id = job.primary_contact_id),
    company.phone,
    ''
  );

  return jsonb_build_object(
    'invoiceId', inv.id,
    'number', inv.number,
    'name', inv.name,
    'issuedAt', inv.issued_at,
    'dueAt', inv.due_at,
    'notes', inv.notes,
    'customerName', v_customer,
    'jobCode', coalesce(job.code, ''),
    'jobName', coalesce(job.name, ''),
    'street', coalesce(job.street, ''),
    'city', coalesce(job.city, ''),
    'state', coalesce(job.state, ''),
    'postalCode', coalesce(job.postal_code, ''),
    'phone', coalesce(v_phone, ''),
    'itemName', v_item,
    'lines', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'description', line.description,
          'quantity', line.quantity,
          'unit', line.unit,
          'unitCost', line.unit_cost
        ) order by line.sort_order
      ), '[]'::jsonb)
      from public.invoice_lines line
      where line.invoice_id = inv.id
    )
  );
end;
$$;

create or replace function public.qbwc_next_work(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  v_invoice uuid;
  v_payload jsonb;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;
  if sess.invoice_id is null then
    v_invoice := public.qbwc_pick_invoice(sess.company_id);
    if v_invoice is null then
      return jsonb_build_object('ok', true, 'done', true);
    end if;
    update public.qbwc_sessions
    set invoice_id = v_invoice, step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket
    returning * into sess;
  end if;
  v_payload := public.qbwc_invoice_payload(sess.invoice_id);
  if v_payload is null then
    update public.qbwc_sessions
    set invoice_id = null, step = 'customer_query', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'done', true);
  end if;
  return jsonb_build_object(
    'ok', true,
    'done', false,
    'ticket', sess.ticket,
    'step', sess.step,
    'work', v_payload
  );
end;
$$;

create or replace function public.qbwc_apply_response(
  p_ticket uuid,
  p_action text,
  p_next_step text default '',
  p_txn_id text default '',
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if p_action = 'next' and coalesce(p_next_step, '') <> '' then
    update public.qbwc_sessions
    set step = p_next_step, last_error = '', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'complete' and sess.invoice_id is not null then
    update public.invoices
    set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
    where id = sess.invoice_id;
    update public.qbwc_sessions
    set invoice_id = null, step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = '', updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true, 'entered', sess.invoice_id);
  end if;

  if p_action = 'fail' then
    if sess.invoice_id is not null then
      update public.invoices
      set qb_status = 'error'
      where id = sess.invoice_id;
    end if;
    update public.qbwc_sessions
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'),
        invoice_id = null,
        step = 'customer_query',
        updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'), updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true, 'failed', sess.invoice_id);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'action');
end;
$$;

create or replace function public.qbwc_get_last_error(p_ticket uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text;
begin
  select last_error into v_error from public.qbwc_sessions where ticket = p_ticket;
  if v_error is null then
    return 'That Web Connector session is no longer open. Run the application again.';
  end if;
  if v_error = '' then
    return '';
  end if;
  return v_error;
end;
$$;

create or replace function public.qbwc_close(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.qbwc_sessions where ticket = p_ticket;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.qbwc_upsert_connector(text, text) from public;
grant execute on function public.qbwc_upsert_connector(text, text) to authenticated;

revoke all on function public.qbwc_authenticate(text, text) from public;
grant execute on function public.qbwc_authenticate(text, text) to anon, authenticated;

revoke all on function public.qbwc_pick_invoice(uuid) from public;

revoke all on function public.qbwc_invoice_payload(uuid) from public;

revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;

revoke all on function public.qbwc_apply_response(uuid, text, text, text, text) from public;
grant execute on function public.qbwc_apply_response(uuid, text, text, text, text) to anon, authenticated;

revoke all on function public.qbwc_get_last_error(uuid) from public;
grant execute on function public.qbwc_get_last_error(uuid) to anon, authenticated;

revoke all on function public.qbwc_close(uuid) from public;
grant execute on function public.qbwc_close(uuid) to anon, authenticated;


-- ========== 20260825220000_qbwc_pgcrypto.sql ==========
-- pgcrypto's crypt/gen_salt live in the extensions schema on hosted Supabase.
-- qbwc_upsert_connector used search_path = public only, so gen_salt(unknown)
-- did not exist when creating a Web Connector password.

create extension if not exists pgcrypto;

create or replace function public.qbwc_upsert_connector(p_password text, p_item_name text default 'Contract work')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company uuid;
  v_row public.qbwc_connectors%rowtype;
  v_item text;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'Not signed in';
  end if;
  v_item := coalesce(nullif(trim(p_item_name), ''), 'Contract work');
  select * into v_row from public.qbwc_connectors where company_id = v_company;
  if not found then
    if coalesce(p_password, '') = '' then
      raise exception 'Set a Web Connector password';
    end if;
    insert into public.qbwc_connectors (company_id, username, password_hash, default_item_name)
    values (
      v_company,
      'truss_' || substr(replace(v_company::text, '-', ''), 1, 12),
      crypt(p_password, gen_salt('bf'::text)),
      v_item
    )
    returning * into v_row;
  else
    update public.qbwc_connectors
    set
      password_hash = case
        when coalesce(p_password, '') = '' then password_hash
        else crypt(p_password, gen_salt('bf'::text))
      end,
      default_item_name = v_item,
      enabled = true,
      updated_at = now()
    where company_id = v_company
    returning * into v_row;
  end if;
  return jsonb_build_object(
    'username', v_row.username,
    'ownerId', v_row.owner_id,
    'fileId', v_row.file_id,
    'itemName', v_row.default_item_name,
    'enabled', v_row.enabled,
    'lastConnectedAt', v_row.last_connected_at,
    'lastError', v_row.last_error
  );
end;
$$;

create or replace function public.qbwc_authenticate(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.qbwc_connectors%rowtype;
  v_ticket uuid;
begin
  if coalesce(p_username, '') = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  select * into v_row
  from public.qbwc_connectors
  where username = trim(p_username)
    and enabled
    and password_hash = crypt(p_password, password_hash)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  delete from public.qbwc_sessions where company_id = v_row.company_id;
  insert into public.qbwc_sessions (company_id)
  values (v_row.company_id)
  returning ticket into v_ticket;
  update public.qbwc_connectors
  set last_connected_at = now(), last_error = '', updated_at = now()
  where company_id = v_row.company_id;
  return jsonb_build_object('ok', true, 'ticket', v_ticket, 'companyId', v_row.company_id);
end;
$$;

revoke all on function public.qbwc_upsert_connector(text, text) from public;
grant execute on function public.qbwc_upsert_connector(text, text) to authenticated;

revoke all on function public.qbwc_authenticate(text, text) from public;
grant execute on function public.qbwc_authenticate(text, text) to anon, authenticated;


-- ========== 20260825230000_qbwc_queue.sql ==========
-- Web Connector only posts invoices that accounting pushed onto the queue.
-- qb_status = 'queued' (not every unentered invoice).

create or replace function public.qbwc_pick_invoice(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select inv.id into v_id
  from public.invoices inv
  where inv.company_id = p_company
    and inv.qb_status = 'queued'
    and inv.status not in ('draft', 'void')
    and inv.job_id is not null
    and exists (
      select 1 from public.invoice_lines line where line.invoice_id = inv.id
    )
  order by inv.issued_at, inv.number
  limit 1;
  return v_id;
end;
$$;


-- ========== 20260825240000_qbwc_expenses_payments.sql ==========
-- Web Connector: queue expenses (check / credit card charge) and payments
-- (receive payment against the QuickBooks invoice TxnID).

alter table public.qbwc_connectors
  add column if not exists bank_account_name text not null default 'Checking';

alter table public.qbwc_connectors
  add column if not exists cc_account_name text not null default 'Credit Card';

alter table public.qbwc_sessions
  add column if not exists expense_id uuid references public.expenses (id) on delete set null;

alter table public.qbwc_sessions
  add column if not exists payment_id uuid references public.payments (id) on delete set null;

alter table public.expenses
  add column if not exists qb_txn_id text not null default '';

alter table public.payments
  add column if not exists qb_txn_id text not null default '';

create or replace function public.qbwc_pick_invoice(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select inv.id into v_id
  from public.invoices inv
  where inv.company_id = p_company
    and inv.qb_status = 'queued'
    and inv.status not in ('draft', 'void')
    and inv.job_id is not null
    and exists (
      select 1 from public.invoice_lines line where line.invoice_id = inv.id
    )
  order by inv.issued_at, inv.number
  limit 1;
  return v_id;
end;
$$;

create or replace function public.qbwc_pick_expense(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select exp.id into v_id
  from public.expenses exp
  where exp.company_id = p_company
    and exp.qb_status = 'queued'
    and exp.amount > 0
    and coalesce(trim(exp.vendor), '') <> ''
    and (
      exp.job_id is not null
      or exp.account in ('office', 'insurance')
    )
  order by exp.incurred_at, exp.number
  limit 1;
  return v_id;
end;
$$;

create or replace function public.qbwc_pick_payment(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select pay.id into v_id
  from public.payments pay
  left join public.invoices inv on inv.id = pay.invoice_id
  where pay.company_id = p_company
    and pay.qb_status = 'queued'
    and pay.amount > 0
    and (
      (
        pay.invoice_id is not null
        and inv.qb_status = 'entered'
        and coalesce(inv.qb_txn_id, '') <> ''
      )
      or (pay.invoice_id is null and pay.job_id is not null)
    )
  order by pay.paid_at, pay.id
  limit 1;
  return v_id;
end;
$$;

create or replace function public.qbwc_invoice_payload(p_invoice uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  v_customer text;
  v_phone text;
  v_item text;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = inv.job_id;
  select * into company from public.companies where id = inv.company_id;
  select default_item_name into v_item from public.qbwc_connectors where company_id = inv.company_id;
  v_item := coalesce(nullif(trim(v_item), ''), 'Contract work');

  v_customer := coalesce(
    (select name from public.clients where id = inv.client_id),
    (select name from public.contacts where id = job.primary_contact_id),
    (select c.name
       from public.opportunities o
       join public.contacts c on c.id = o.primary_contact_id
      where o.id = job.opportunity_id),
    'Homeowner'
  );
  v_phone := coalesce(
    (select phone from public.contacts where id = job.primary_contact_id),
    company.phone,
    ''
  );

  return jsonb_build_object(
    'kind', 'invoice',
    'invoiceId', inv.id,
    'number', inv.number,
    'name', inv.name,
    'issuedAt', inv.issued_at,
    'dueAt', inv.due_at,
    'notes', inv.notes,
    'customerName', v_customer,
    'jobCode', coalesce(job.code, ''),
    'jobName', coalesce(job.name, ''),
    'street', coalesce(job.street, ''),
    'city', coalesce(job.city, ''),
    'state', coalesce(job.state, ''),
    'postalCode', coalesce(job.postal_code, ''),
    'phone', coalesce(v_phone, ''),
    'itemName', v_item,
    'lines', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'description', line.description,
          'quantity', line.quantity,
          'unit', line.unit,
          'unitCost', line.unit_cost
        ) order by line.sort_order
      ), '[]'::jsonb)
      from public.invoice_lines line
      where line.invoice_id = inv.id
    )
  );
end;
$$;

create or replace function public.qbwc_expense_payload(p_expense uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  exp public.expenses%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  conn public.qbwc_connectors%rowtype;
  v_customer text;
  v_phone text;
  v_account text;
  v_pay text;
  v_pay_account text;
  v_has_job boolean;
  v_job_code text;
begin
  select * into exp from public.expenses where id = p_expense;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = exp.job_id;
  select * into company from public.companies where id = exp.company_id;
  select * into conn from public.qbwc_connectors where company_id = exp.company_id;

  v_has_job := job.id is not null;
  v_job_code := case
    when not v_has_job then ''
    else coalesce(nullif(trim(job.code), ''), nullif(trim(job.name), ''), 'Job')
  end;

  v_account := case exp.account
    when 'materials' then 'Job materials'
    when 'subcontractors' then 'Subcontractors'
    when 'equipment_rental' then 'Equipment rental'
    when 'dumpsters' then 'Dumpsters / disposal'
    when 'permits' then 'Permits & fees'
    when 'labor' then 'Direct labor'
    when 'fuel' then 'Fuel'
    when 'office' then 'Office / overhead'
    when 'insurance' then 'Insurance'
    else 'Other'
  end;
  v_pay := case when exp.method = 'credit_card' then 'credit_card' else 'check' end;
  v_pay_account := case
    when v_pay = 'credit_card' then coalesce(nullif(trim(conn.cc_account_name), ''), 'Credit Card')
    else coalesce(nullif(trim(conn.bank_account_name), ''), 'Checking')
  end;

  if v_has_job then
    v_customer := coalesce(
      (select name from public.contacts where id = job.primary_contact_id),
      (select c.name
         from public.opportunities o
         join public.contacts c on c.id = o.primary_contact_id
        where o.id = job.opportunity_id),
      (select name from public.clients where id = (
        select client_id from public.opportunities where id = job.opportunity_id
      )),
      'Homeowner'
    );
  else
    v_customer := '';
  end if;
  v_phone := coalesce(
    (select phone from public.contacts where id = job.primary_contact_id),
    company.phone,
    ''
  );

  return jsonb_build_object(
    'kind', 'expense',
    'expenseId', exp.id,
    'number', exp.number,
    'vendor', exp.vendor,
    'accountName', v_account,
    'amount', exp.amount,
    'payWith', v_pay,
    'txnDate', exp.incurred_at,
    'memo', coalesce(exp.memo, ''),
    'payAccount', v_pay_account,
    'customerName', v_customer,
    'jobId', job.id,
    'jobCode', v_job_code,
    'jobName', coalesce(job.name, ''),
    'street', coalesce(job.street, ''),
    'city', coalesce(job.city, ''),
    'state', coalesce(job.state, ''),
    'postalCode', coalesce(job.postal_code, ''),
    'phone', coalesce(v_phone, ''),
    'hasJob', v_has_job
  );
end;
$$;

create or replace function public.qbwc_payment_payload(p_payment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
  inv public.invoices%rowtype;
  job public.jobs%rowtype;
  conn public.qbwc_connectors%rowtype;
  v_customer text;
  v_job uuid;
begin
  select * into pay from public.payments where id = p_payment;
  if not found then
    return null;
  end if;
  if pay.invoice_id is not null then
    select * into inv from public.invoices where id = pay.invoice_id;
  end if;
  v_job := coalesce(pay.job_id, inv.job_id);
  select * into job from public.jobs where id = v_job;
  select * into conn from public.qbwc_connectors where company_id = pay.company_id;

  v_customer := coalesce(
    (select name from public.clients where id = inv.client_id),
    (select name from public.contacts where id = job.primary_contact_id),
    (select c.name
       from public.opportunities o
       join public.contacts c on c.id = o.primary_contact_id
      where o.id = job.opportunity_id),
    'Homeowner'
  );

  return jsonb_build_object(
    'kind', 'payment',
    'paymentId', pay.id,
    'amount', pay.amount,
    'txnDate', pay.paid_at,
    'reference', coalesce(pay.reference, ''),
    'memo', coalesce(inv.number, pay.reference, ''),
    'customerName', v_customer,
    'jobCode', coalesce(job.code, ''),
    'jobName', coalesce(job.name, ''),
    'invoiceNumber', coalesce(inv.number, ''),
    'invoiceTxnId', coalesce(inv.qb_txn_id, ''),
    'depositAccount', coalesce(nullif(trim(conn.bank_account_name), ''), 'Checking'),
    'hasJob', job.id is not null
  );
end;
$$;

create or replace function public.qbwc_next_work(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  v_invoice uuid;
  v_expense uuid;
  v_payment uuid;
  v_payload jsonb;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if sess.invoice_id is null and sess.expense_id is null and sess.payment_id is null then
    v_invoice := public.qbwc_pick_invoice(sess.company_id);
    if v_invoice is not null then
      update public.qbwc_sessions
      set invoice_id = v_invoice, expense_id = null, payment_id = null,
          step = 'customer_query', last_error = '', updated_at = now()
      where ticket = p_ticket
      returning * into sess;
    else
      v_expense := public.qbwc_pick_expense(sess.company_id);
      if v_expense is not null then
        update public.qbwc_sessions
        set expense_id = v_expense, invoice_id = null, payment_id = null,
            step = 'vendor_query', last_error = '', updated_at = now()
        where ticket = p_ticket
        returning * into sess;
      else
        v_payment := public.qbwc_pick_payment(sess.company_id);
        if v_payment is not null then
          update public.qbwc_sessions
          set payment_id = v_payment, invoice_id = null, expense_id = null,
              step = 'customer_query', last_error = '', updated_at = now()
          where ticket = p_ticket
          returning * into sess;
        else
          return jsonb_build_object('ok', true, 'done', true);
        end if;
      end if;
    end if;
  end if;

  if sess.invoice_id is not null then
    v_payload := public.qbwc_invoice_payload(sess.invoice_id);
  elsif sess.expense_id is not null then
    v_payload := public.qbwc_expense_payload(sess.expense_id);
  else
    v_payload := public.qbwc_payment_payload(sess.payment_id);
  end if;

  if v_payload is null then
    update public.qbwc_sessions
    set invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'done', true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'done', false,
    'ticket', sess.ticket,
    'step', sess.step,
    'work', v_payload
  );
end;
$$;

create or replace function public.qbwc_apply_response(
  p_ticket uuid,
  p_action text,
  p_next_step text default '',
  p_txn_id text default '',
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if p_action = 'next' and coalesce(p_next_step, '') <> '' then
    update public.qbwc_sessions
    set step = p_next_step, last_error = '', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'complete' then
    if sess.invoice_id is not null then
      update public.invoices
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.invoice_id;
    elsif sess.expense_id is not null then
      update public.expenses
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.expense_id;
    elsif sess.payment_id is not null then
      update public.payments
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.payment_id;
    else
      return jsonb_build_object('ok', false, 'reason', 'action');
    end if;
    update public.qbwc_sessions
    set invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = '', updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'fail' then
    if sess.invoice_id is not null then
      update public.invoices set qb_status = 'error' where id = sess.invoice_id;
    end if;
    if sess.expense_id is not null then
      update public.expenses set qb_status = 'error' where id = sess.expense_id;
    end if;
    if sess.payment_id is not null then
      update public.payments set qb_status = 'error' where id = sess.payment_id;
    end if;
    update public.qbwc_sessions
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'),
        invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query',
        updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'), updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'action');
end;
$$;

revoke all on function public.qbwc_pick_expense(uuid) from public;
revoke all on function public.qbwc_pick_payment(uuid) from public;
revoke all on function public.qbwc_expense_payload(uuid) from public;
revoke all on function public.qbwc_payment_payload(uuid) from public;
revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;
revoke all on function public.qbwc_apply_response(uuid, text, text, text, text) from public;
grant execute on function public.qbwc_apply_response(uuid, text, text, text, text) to anon, authenticated;

-- ========== 20260825250000_qbwc_customer_alias.sql ==========

-- When the homeowner/client name already exists as a Vendor (or Other Name),
-- CustomerAdd cannot reuse it. Remember the customer ListID / an aliased
-- customer name on the session so the job hangs under a real Customer.

alter table public.qbwc_sessions
  add column if not exists resolved_customer text not null default '';

alter table public.qbwc_sessions
  add column if not exists resolved_customer_list_id text not null default '';

alter table public.qbwc_sessions
  add column if not exists resolved_job_list_id text not null default '';

create or replace function public.qbwc_next_work(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  v_invoice uuid;
  v_expense uuid;
  v_payment uuid;
  v_payload jsonb;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if sess.invoice_id is null and sess.expense_id is null and sess.payment_id is null then
    v_invoice := public.qbwc_pick_invoice(sess.company_id);
    if v_invoice is not null then
      update public.qbwc_sessions
      set invoice_id = v_invoice, expense_id = null, payment_id = null,
          step = 'customer_query', last_error = '',
          resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
          updated_at = now()
      where ticket = p_ticket
      returning * into sess;
    else
      v_expense := public.qbwc_pick_expense(sess.company_id);
      if v_expense is not null then
        update public.qbwc_sessions
        set expense_id = v_expense, invoice_id = null, payment_id = null,
            step = 'vendor_query', last_error = '',
            resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
            updated_at = now()
        where ticket = p_ticket
        returning * into sess;
      else
        v_payment := public.qbwc_pick_payment(sess.company_id);
        if v_payment is not null then
          update public.qbwc_sessions
          set payment_id = v_payment, invoice_id = null, expense_id = null,
              step = 'customer_query', last_error = '',
              resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
              updated_at = now()
          where ticket = p_ticket
          returning * into sess;
        else
          return jsonb_build_object('ok', true, 'done', true);
        end if;
      end if;
    end if;
  end if;

  if sess.invoice_id is not null then
    v_payload := public.qbwc_invoice_payload(sess.invoice_id);
  elsif sess.expense_id is not null then
    v_payload := public.qbwc_expense_payload(sess.expense_id);
  else
    v_payload := public.qbwc_payment_payload(sess.payment_id);
  end if;

  if v_payload is null then
    update public.qbwc_sessions
    set invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query',
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
        updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'done', true);
  end if;

  if coalesce(sess.resolved_customer, '') <> '' then
    v_payload := jsonb_set(v_payload, '{customerName}', to_jsonb(sess.resolved_customer));
  end if;
  if coalesce(sess.resolved_customer_list_id, '') <> '' then
    v_payload := v_payload || jsonb_build_object('customerListId', sess.resolved_customer_list_id);
  end if;
  if coalesce(sess.resolved_job_list_id, '') <> '' then
    v_payload := v_payload || jsonb_build_object('jobListId', sess.resolved_job_list_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'done', false,
    'ticket', sess.ticket,
    'step', sess.step,
    'work', v_payload
  );
end;
$$;

drop function if exists public.qbwc_apply_response(uuid, text, text, text, text);

create or replace function public.qbwc_apply_response(
  p_ticket uuid,
  p_action text,
  p_next_step text default '',
  p_txn_id text default '',
  p_error text default '',
  p_customer_name text default '',
  p_customer_list_id text default '',
  p_job_list_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if p_action = 'next' and coalesce(p_next_step, '') <> '' then
    update public.qbwc_sessions
    set step = p_next_step,
        last_error = '',
        resolved_customer = case
          when coalesce(p_customer_name, '') <> '' then p_customer_name
          else resolved_customer
        end,
        resolved_customer_list_id = case
          when coalesce(p_customer_list_id, '') <> '' then p_customer_list_id
          else resolved_customer_list_id
        end,
        resolved_job_list_id = case
          when coalesce(p_job_list_id, '') <> '' then p_job_list_id
          else resolved_job_list_id
        end,
        updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'complete' then
    if sess.invoice_id is not null then
      update public.invoices
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.invoice_id;
    elsif sess.expense_id is not null then
      update public.expenses
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.expense_id;
    elsif sess.payment_id is not null then
      update public.payments
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.payment_id;
    else
      return jsonb_build_object('ok', false, 'reason', 'action');
    end if;
    update public.qbwc_sessions
    set invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query', last_error = '',
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
        updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = '', updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'fail' then
    if sess.invoice_id is not null then
      update public.invoices set qb_status = 'error' where id = sess.invoice_id;
    end if;
    if sess.expense_id is not null then
      update public.expenses set qb_status = 'error' where id = sess.expense_id;
    end if;
    if sess.payment_id is not null then
      update public.payments set qb_status = 'error' where id = sess.payment_id;
    end if;
    update public.qbwc_sessions
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'),
        invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query',
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
        updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'), updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'action');
end;
$$;

revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;
revoke all on function public.qbwc_apply_response(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.qbwc_apply_response(uuid, text, text, text, text, text, text, text) to anon, authenticated;

-- Pull QuickBooks Desktop vendors into Truss so expense payees are a dropdown
-- of names that already exist in the company file.

create table if not exists public.qb_vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  list_id text not null default '',
  name text not null,
  is_active boolean not null default true,
  synced_at timestamptz not null default now()
);

create unique index if not exists qb_vendors_company_list_id_idx
  on public.qb_vendors (company_id, list_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qb_vendors_company_list_id_key'
  ) then
    alter table public.qb_vendors
      add constraint qb_vendors_company_list_id_key unique using index qb_vendors_company_list_id_idx;
  end if;
end $$;

create index if not exists qb_vendors_company_name_idx
  on public.qb_vendors (company_id, lower(name));

alter table public.qb_vendors enable row level security;

drop policy if exists "company isolation" on public.qb_vendors;
create policy "company isolation" on public.qb_vendors
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

alter table public.qbwc_connectors
  add column if not exists vendor_sync_requested boolean not null default true;

alter table public.qbwc_connectors
  add column if not exists vendors_synced_at timestamptz;

alter table public.qbwc_sessions
  add column if not exists vendor_sync boolean not null default false;

alter table public.qbwc_sessions
  add column if not exists vendor_iterator_id text not null default '';

alter table public.qbwc_sessions
  add column if not exists vendor_sync_started_at timestamptz;

create or replace function public.qbwc_request_vendor_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'Not signed in';
  end if;
  update public.qbwc_connectors
  set vendor_sync_requested = true, updated_at = now()
  where company_id = v_company;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'connector');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.qbwc_save_vendors(
  p_ticket uuid,
  p_vendors jsonb default '[]'::jsonb,
  p_iterator_id text default '',
  p_done boolean default false,
  p_abort boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  item jsonb;
  v_name text;
  v_list text;
  v_active boolean;
  v_started timestamptz;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if p_abort then
    update public.qbwc_sessions
    set vendor_sync = false, vendor_iterator_id = '', step = 'customer_query', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'aborted', true);
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_vendors, '[]'::jsonb))
  loop
    v_name := nullif(trim(coalesce(item->>'name', '')), '');
    if v_name is null then
      continue;
    end if;
    v_list := coalesce(nullif(trim(item->>'listId'), ''), '');
    v_active := coalesce((item->>'isActive')::boolean, true);
    if v_list = '' then
      continue;
    end if;
    insert into public.qb_vendors (company_id, list_id, name, is_active, synced_at)
    values (sess.company_id, v_list, v_name, v_active, now())
    on conflict (company_id, list_id)
    do update set name = excluded.name, is_active = excluded.is_active, synced_at = now();
  end loop;

  if p_done then
    v_started := coalesce(sess.vendor_sync_started_at, now() - interval '1 second');
    update public.qb_vendors
    set is_active = false
    where company_id = sess.company_id
      and synced_at < v_started;
    update public.qbwc_connectors
    set vendors_synced_at = now(), vendor_sync_requested = false, last_error = '', updated_at = now()
    where company_id = sess.company_id;
    update public.qbwc_sessions
    set vendor_sync = false, vendor_iterator_id = '', vendor_sync_started_at = null,
        step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket;
  else
    update public.qbwc_sessions
    set vendor_iterator_id = coalesce(p_iterator_id, ''),
        step = 'vendor_list_query',
        last_error = '',
        updated_at = now()
    where ticket = p_ticket;
  end if;

  return jsonb_build_object('ok', true, 'done', p_done);
end;
$$;

create or replace function public.qbwc_next_work(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  conn public.qbwc_connectors%rowtype;
  v_invoice uuid;
  v_expense uuid;
  v_payment uuid;
  v_payload jsonb;
  v_stale boolean;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if sess.vendor_sync
     and sess.invoice_id is null
     and sess.expense_id is null
     and sess.payment_id is null then
    return jsonb_build_object(
      'ok', true,
      'done', false,
      'ticket', sess.ticket,
      'step', 'vendor_list_query',
      'work', jsonb_build_object(
        'kind', 'vendor_sync',
        'iteratorId', coalesce(sess.vendor_iterator_id, '')
      )
    );
  end if;

  if sess.invoice_id is null and sess.expense_id is null and sess.payment_id is null then
    select * into conn from public.qbwc_connectors where company_id = sess.company_id;
    v_stale := conn.company_id is not null and (
      coalesce(conn.vendor_sync_requested, true)
      or conn.vendors_synced_at is null
      or conn.vendors_synced_at < now() - interval '20 hours'
    );
    if v_stale then
      update public.qbwc_sessions
      set vendor_sync = true, vendor_iterator_id = '', vendor_sync_started_at = now(),
          step = 'vendor_list_query', last_error = '',
          resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
          updated_at = now()
      where ticket = p_ticket
      returning * into sess;
      return jsonb_build_object(
        'ok', true,
        'done', false,
        'ticket', sess.ticket,
        'step', 'vendor_list_query',
        'work', jsonb_build_object('kind', 'vendor_sync', 'iteratorId', '')
      );
    end if;

    v_invoice := public.qbwc_pick_invoice(sess.company_id);
    if v_invoice is not null then
      update public.qbwc_sessions
      set invoice_id = v_invoice, expense_id = null, payment_id = null,
          step = 'customer_query', last_error = '',
          resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
          updated_at = now()
      where ticket = p_ticket
      returning * into sess;
    else
      v_expense := public.qbwc_pick_expense(sess.company_id);
      if v_expense is not null then
        update public.qbwc_sessions
        set expense_id = v_expense, invoice_id = null, payment_id = null,
            step = 'vendor_query', last_error = '',
            resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
            updated_at = now()
        where ticket = p_ticket
        returning * into sess;
      else
        v_payment := public.qbwc_pick_payment(sess.company_id);
        if v_payment is not null then
          update public.qbwc_sessions
          set payment_id = v_payment, invoice_id = null, expense_id = null,
              step = 'customer_query', last_error = '',
              resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
              updated_at = now()
          where ticket = p_ticket
          returning * into sess;
        else
          return jsonb_build_object('ok', true, 'done', true);
        end if;
      end if;
    end if;
  end if;

  if sess.invoice_id is not null then
    v_payload := public.qbwc_invoice_payload(sess.invoice_id);
  elsif sess.expense_id is not null then
    v_payload := public.qbwc_expense_payload(sess.expense_id);
  else
    v_payload := public.qbwc_payment_payload(sess.payment_id);
  end if;

  if v_payload is null then
    update public.qbwc_sessions
    set invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query',
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
        updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'done', true);
  end if;

  if coalesce(sess.resolved_customer, '') <> '' then
    v_payload := jsonb_set(v_payload, '{customerName}', to_jsonb(sess.resolved_customer));
  end if;
  if coalesce(sess.resolved_customer_list_id, '') <> '' then
    v_payload := v_payload || jsonb_build_object('customerListId', sess.resolved_customer_list_id);
  end if;
  if coalesce(sess.resolved_job_list_id, '') <> '' then
    v_payload := v_payload || jsonb_build_object('jobListId', sess.resolved_job_list_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'done', false,
    'ticket', sess.ticket,
    'step', sess.step,
    'work', v_payload
  );
end;
$$;

revoke all on function public.qbwc_request_vendor_sync() from public;
grant execute on function public.qbwc_request_vendor_sync() to authenticated;
revoke all on function public.qbwc_save_vendors(uuid, jsonb, text, boolean, boolean) from public;
grant execute on function public.qbwc_save_vendors(uuid, jsonb, text, boolean, boolean) to anon, authenticated;
revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;

-- Review comments on invoices, expenses, and payments (Dropbox-style
-- notes). Accounting uses these when returning a record to the PM.
-- qb_status stays text; 'returned' means waiting on the project manager.

create table if not exists public.qb_review_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'expense', 'payment')),
  record_id uuid not null,
  body text not null,
  intent text not null default 'comment'
    check (intent in ('comment', 'return', 'approve', 'resubmit')),
  author_staff_id text not null default '',
  author_name text not null default '',
  mentioned_staff_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.qb_review_comments
  add column if not exists mentioned_staff_ids text[] not null default '{}';

create index if not exists qb_review_comments_record_idx
  on public.qb_review_comments (company_id, kind, record_id, created_at);

create index if not exists qb_review_comments_mentions_idx
  on public.qb_review_comments using gin (mentioned_staff_ids);

alter table public.qb_review_comments enable row level security;

drop policy if exists "company isolation" on public.qb_review_comments;
create policy "company isolation" on public.qb_review_comments
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ========== 20260827020000_qbwc_expense_job.sql ==========
-- Job expenses must post onto Customer:Job, not the company overhead account.

create or replace function public.qbwc_pick_expense(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select exp.id into v_id
  from public.expenses exp
  where exp.company_id = p_company
    and exp.qb_status = 'queued'
    and exp.amount > 0
    and coalesce(trim(exp.vendor), '') <> ''
    and (
      exp.job_id is not null
      or exp.account in ('office', 'insurance')
    )
  order by exp.incurred_at, exp.number
  limit 1;
  return v_id;
end;
$$;

create or replace function public.qbwc_expense_payload(p_expense uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  exp public.expenses%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  conn public.qbwc_connectors%rowtype;
  v_customer text;
  v_phone text;
  v_account text;
  v_pay text;
  v_pay_account text;
  v_has_job boolean;
  v_job_code text;
begin
  select * into exp from public.expenses where id = p_expense;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = exp.job_id;
  select * into company from public.companies where id = exp.company_id;
  select * into conn from public.qbwc_connectors where company_id = exp.company_id;

  v_has_job := job.id is not null;
  v_job_code := case
    when not v_has_job then ''
    else coalesce(nullif(trim(job.code), ''), nullif(trim(job.name), ''), 'Job')
  end;

  v_account := case exp.account
    when 'materials' then 'Job materials'
    when 'subcontractors' then 'Subcontractors'
    when 'equipment_rental' then 'Equipment rental'
    when 'dumpsters' then 'Dumpsters / disposal'
    when 'permits' then 'Permits & fees'
    when 'labor' then 'Direct labor'
    when 'fuel' then 'Fuel'
    when 'office' then 'Office / overhead'
    when 'insurance' then 'Insurance'
    else 'Other'
  end;
  v_pay := case when exp.method = 'credit_card' then 'credit_card' else 'check' end;
  v_pay_account := case
    when v_pay = 'credit_card' then coalesce(nullif(trim(conn.cc_account_name), ''), 'Credit Card')
    else coalesce(nullif(trim(conn.bank_account_name), ''), 'Checking')
  end;

  if v_has_job then
    v_customer := coalesce(
      (select name from public.contacts where id = job.primary_contact_id),
      (select c.name
         from public.opportunities o
         join public.contacts c on c.id = o.primary_contact_id
        where o.id = job.opportunity_id),
      (select name from public.clients where id = (
        select client_id from public.opportunities where id = job.opportunity_id
      )),
      'Homeowner'
    );
  else
    v_customer := '';
  end if;
  v_phone := coalesce(
    (select phone from public.contacts where id = job.primary_contact_id),
    company.phone,
    ''
  );

  return jsonb_build_object(
    'kind', 'expense',
    'expenseId', exp.id,
    'number', exp.number,
    'vendor', exp.vendor,
    'accountName', v_account,
    'amount', exp.amount,
    'payWith', v_pay,
    'txnDate', exp.incurred_at,
    'memo', coalesce(exp.memo, ''),
    'payAccount', v_pay_account,
    'customerName', v_customer,
    'jobId', job.id,
    'jobCode', v_job_code,
    'jobName', coalesce(job.name, ''),
    'street', coalesce(job.street, ''),
    'city', coalesce(job.city, ''),
    'state', coalesce(job.state, ''),
    'postalCode', coalesce(job.postal_code, ''),
    'phone', coalesce(v_phone, ''),
    'hasJob', v_has_job
  );
end;
$$;


-- ========== 20260827180000_document_notes.sql ==========
-- Customer-facing notes on shared estimates and invoices. Prints after the
-- total on the proposal, the invoice, and the PDF.

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
      'secondSignatureImage', coalesce(est.second_signature_image, '')
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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;

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

revoke all on function public.shared_invoice(text) from public;
grant execute on function public.shared_invoice(text) to anon, authenticated;

-- Job material orders. Built by hand from the price book (or custom lines),
-- independent of the estimate or invoice. Unit costs copy from catalog_items.

create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  vendor text not null default '',
  notes text not null default '',
  needed_by date,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists material_orders_company_number_idx
  on public.material_orders (company_id, number);
create index if not exists material_orders_job_id_idx on public.material_orders (job_id);
create index if not exists material_orders_company_id_idx on public.material_orders (company_id);

create table if not exists public.material_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  material_order_id uuid not null references public.material_orders (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  name text not null,
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'EA',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists material_order_lines_order_id_idx
  on public.material_order_lines (material_order_id);

alter table public.material_orders enable row level security;
alter table public.material_order_lines enable row level security;

drop policy if exists "company isolation" on public.material_orders;
create policy "company isolation" on public.material_orders
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.material_order_lines;
create policy "company isolation" on public.material_order_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.material_orders to authenticated;
grant select, insert, update, delete on table public.material_order_lines to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.material_orders';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.material_order_lines';
exception
  when duplicate_object then null;
end $$;

