-- Optional average margin on a job. When set, projected profit is this percent of
-- projected income instead of estimate line costs and forecasted expenses.

alter table public.jobs
  add column if not exists projected_margin_percent numeric(8, 2);

alter table public.jobs drop constraint if exists jobs_projected_margin_percent_check;
alter table public.jobs
  add constraint jobs_projected_margin_percent_check
  check (
    projected_margin_percent is null
    or (projected_margin_percent >= -100 and projected_margin_percent <= 100)
  );

comment on column public.jobs.projected_margin_percent is
  'When set, job projected profit uses this net margin percent of projected income.';

notify pgrst, 'reload schema';
