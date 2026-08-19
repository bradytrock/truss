-- Seats, teams, contact-book ownership, referral partners.

create type public.seat_role as enum (
  'company_admin',
  'business_development',
  'team_lead',
  'team_admin',
  'project_manager',
  'estimator',
  'superintendent'
);

alter table public.profiles
  add column if not exists role public.seat_role not null default 'project_manager';

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  lead_staff_id uuid,
  created_at timestamptz not null default now()
);

create index teams_company_id_idx on public.teams (company_id);

alter table public.team_members
  add column if not exists role public.seat_role not null default 'project_manager',
  add column if not exists team_id uuid references public.teams (id) on delete set null,
  add column if not exists initials text not null default '';

create index team_members_team_id_idx on public.team_members (team_id);

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

create index contacts_owner_staff_id_idx on public.contacts (owner_staff_id);
create index jobs_owner_staff_id_idx on public.jobs (owner_staff_id);
create index opportunities_owner_staff_id_idx on public.opportunities (owner_staff_id);

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
