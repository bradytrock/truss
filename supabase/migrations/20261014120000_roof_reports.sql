-- In-house roof measurement. One drawing per job. Facets, edges, and vertices
-- live on the row so the editor saves in one write. EagleView orders stay separate.

create table if not exists public.roof_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  image_path text not null default '',
  image_width integer not null default 0,
  image_height integer not null default 0,
  feet_per_pixel numeric,
  waste_percent numeric not null default 15,
  points jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  facets jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint roof_reports_job_id_key unique (job_id)
);

create index if not exists roof_reports_company_id_idx on public.roof_reports (company_id);

alter table public.roof_reports enable row level security;

drop policy if exists "company isolation" on public.roof_reports;
create policy "company isolation" on public.roof_reports
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.roof_reports to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.roof_reports';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
