-- The desk loads these tables with `where company_id = ? order by <time> desc`.
-- Existing indexes lead with status or entity, so that sort scanned the company.

create index if not exists jobs_company_start_date_idx
  on public.jobs (company_id, start_date desc);

create index if not exists activities_company_created_idx
  on public.activities (company_id, created_at desc);

create index if not exists estimates_company_created_idx
  on public.estimates (company_id, created_at desc);

create index if not exists job_photos_company_taken_idx
  on public.job_photos (company_id, taken_at desc);
