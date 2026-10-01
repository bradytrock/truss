-- Trades involved on a job: fencing, roofing, gutters, siding, flooring, other.

alter table public.jobs
  add column if not exists trades text[] not null default '{}';
