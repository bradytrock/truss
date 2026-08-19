-- Job / pipeline record codes: BJ081926-A (creator initials + MMDDYY + daily letter).

alter table public.opportunities
  add column if not exists code text not null default '';

alter table public.jobs
  add column if not exists code text not null default '';

create index if not exists opportunities_company_code_idx
  on public.opportunities (company_id, code);

create index if not exists jobs_company_code_idx
  on public.jobs (company_id, code);
