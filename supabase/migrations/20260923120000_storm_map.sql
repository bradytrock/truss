-- Storm / field map: geocoded job sites plus live phone locations from
-- signed-in mobile seats (the same pings storm mode already collects).

alter table public.jobs
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_query text not null default '';

create index if not exists jobs_company_coords_idx
  on public.jobs (company_id)
  where lat is not null and lng is not null and deleted_at is null;

comment on column public.jobs.lat is
  'Geocoded job-site latitude. Null until the address has been looked up.';
comment on column public.jobs.lng is
  'Geocoded job-site longitude. Null until the address has been looked up.';
comment on column public.jobs.geocode_query is
  'Address string that produced lat/lng. When the site changes, this no longer matches and the desk remaps.';

create table if not exists public.staff_device_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  heading double precision,
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_device_locations_staff_key
  on public.staff_device_locations (company_id, staff_id);
create index if not exists staff_device_locations_company_fresh_idx
  on public.staff_device_locations (company_id, updated_at desc);

alter table public.staff_device_locations enable row level security;

drop policy if exists "company isolation" on public.staff_device_locations;
create policy "company isolation" on public.staff_device_locations
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on public.staff_device_locations to authenticated;

comment on table public.staff_device_locations is
  'Latest GPS ping per seat from the mobile app (storm mode) or the desk map.';

alter table public.staff_device_locations replica identity full;
do $$
begin
  execute 'alter publication supabase_realtime add table public.staff_device_locations';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
