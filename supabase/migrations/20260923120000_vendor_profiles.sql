-- Company-wide vendor and trade profiles: shared notes, crew feedback, and pricing.
-- Separate from qb_vendors.notes, which QuickBooks sync overwrites.

create table if not exists public.vendor_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  name_key text not null,
  notes text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists vendor_profiles_company_name_key_idx
  on public.vendor_profiles (company_id, name_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendor_profiles_company_name_key'
  ) then
    alter table public.vendor_profiles
      add constraint vendor_profiles_company_name_key unique using index vendor_profiles_company_name_key_idx;
  end if;
end $$;
create index if not exists vendor_profiles_company_id_idx
  on public.vendor_profiles (company_id);

create table if not exists public.vendor_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.vendor_profiles (id) on delete cascade,
  body text not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists vendor_feedback_profile_id_idx
  on public.vendor_feedback (profile_id, created_at desc);
create index if not exists vendor_feedback_company_id_idx
  on public.vendor_feedback (company_id);

create table if not exists public.vendor_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.vendor_profiles (id) on delete cascade,
  name text not null,
  unit text not null default 'EA',
  unit_cost numeric(14, 2) not null default 0,
  notes text not null default '',
  sort_order integer not null default 0
);

create index if not exists vendor_prices_profile_id_idx
  on public.vendor_prices (profile_id, sort_order);
create index if not exists vendor_prices_company_id_idx
  on public.vendor_prices (company_id);

alter table public.vendor_profiles enable row level security;
alter table public.vendor_feedback enable row level security;
alter table public.vendor_prices enable row level security;

drop policy if exists "company isolation" on public.vendor_profiles;
create policy "company isolation" on public.vendor_profiles
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.vendor_feedback;
create policy "company isolation" on public.vendor_feedback
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.vendor_prices;
create policy "company isolation" on public.vendor_prices
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.vendor_profiles to authenticated;
grant select, insert, update, delete on table public.vendor_feedback to authenticated;
grant select, insert, update, delete on table public.vendor_prices to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.vendor_profiles';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.vendor_feedback';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.vendor_prices';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
