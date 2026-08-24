-- TheRoofingCRM: companies, profiles, pipeline, jobs, activity.
-- RLS isolates every row to the signed-in user's company.

create extension if not exists "pgcrypto";

create type public.pipeline_stage as enum (
  'pursuing',
  'estimating',
  'bid_submitted',
  'interview',
  'awarded',
  'lost'
);

create type public.job_status as enum (
  'precon',
  'in_progress',
  'punch',
  'complete',
  'on_hold'
);

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

create type public.delivery_method as enum (
  'design_bid_build',
  'cm_at_risk',
  'design_build',
  'gc_mp'
);

create type public.client_type as enum (
  'owner',
  'developer',
  'public',
  'healthcare_system',
  'architect'
);

create type public.activity_type as enum (
  'note',
  'call',
  'email',
  'meeting',
  'site_walk',
  'stage_change'
);

create type public.entity_kind as enum (
  'opportunity',
  'job',
  'client'
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  title text not null default 'Team member',
  initials text not null,
  created_at timestamptz not null default now()
);

create index profiles_company_id_idx on public.profiles (company_id);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  title text not null default '',
  created_at timestamptz not null default now()
);

create index team_members_company_id_idx on public.team_members (company_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  type public.client_type not null,
  city text not null,
  state text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index clients_company_id_idx on public.clients (company_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  title text not null default '',
  email text not null default '',
  phone text not null default ''
);

create index contacts_company_id_idx on public.contacts (company_id);
create index contacts_client_id_idx on public.contacts (client_id);

create table public.opportunities (
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

create index opportunities_company_id_stage_idx on public.opportunities (company_id, stage);
create index opportunities_client_id_idx on public.opportunities (client_id);

create table public.jobs (
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

create index jobs_company_id_status_idx on public.jobs (company_id, status);
create index jobs_opportunity_id_idx on public.jobs (opportunity_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entity_type public.entity_kind not null,
  entity_id uuid not null,
  type public.activity_type not null default 'note',
  body text not null,
  author text not null,
  created_at timestamptz not null default now()
);

create index activities_company_entity_idx
  on public.activities (company_id, entity_type, entity_id, created_at desc);

create table public.tasks (
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

create index tasks_company_open_due_idx
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

create policy "read own company" on public.companies
  for select to authenticated
  using (id = public.current_company_id());

create policy "update own company" on public.companies
  for update to authenticated
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

create policy "read company profiles" on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id());

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "company isolation" on public.team_members
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.clients
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.contacts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.opportunities
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.jobs
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.activities
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

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
