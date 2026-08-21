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
