-- Mapping + coverage for EagleView qty: qty = measurement / coverage.

alter table public.estimate_template_lines
  add column if not exists measurement_key text not null default '';

alter table public.estimate_template_lines
  add column if not exists coverage_amount numeric(14, 4) not null default 1;

alter table public.estimate_template_lines
  add column if not exists coverage_unit text not null default 'squares';

alter table public.estimate_lines
  add column if not exists measurement_key text not null default '';

alter table public.estimate_lines
  add column if not exists coverage_amount numeric(14, 4) not null default 1;

alter table public.estimate_lines
  add column if not exists coverage_unit text not null default 'squares';
