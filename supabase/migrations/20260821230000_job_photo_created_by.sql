-- Who took a job photo, so the company Photos feed can show a name on each thumbnail.
-- Job access stays scoped; photos are visible to every seat in the company.

alter table public.job_photos
  add column if not exists created_by text not null default '';
