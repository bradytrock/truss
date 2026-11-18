-- Crew notes on a job photo, separate from the caption shown in the viewer.

alter table public.job_photos
  add column if not exists notes text not null default '';
