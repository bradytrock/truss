-- Monthly sales goal: company default + optional per-seat override.
-- Null on team_members means inherit companies.default_monthly_sales_quota.

alter table public.companies
  add column if not exists default_monthly_sales_quota numeric(14, 2) not null default 0;

alter table public.team_members
  add column if not exists monthly_sales_quota numeric(14, 2);

comment on column public.companies.default_monthly_sales_quota is
  'Default monthly signed-contract goal (USD) for seats without their own quota.';

comment on column public.team_members.monthly_sales_quota is
  'Optional monthly signed-contract goal (USD). Null inherits the company default.';
