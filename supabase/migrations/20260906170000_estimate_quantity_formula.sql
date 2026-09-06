-- Per-line quantity formulas for EagleView apply (templates → estimates).

alter table public.estimate_template_lines
  add column if not exists quantity_formula text not null default '';

alter table public.estimate_lines
  add column if not exists quantity_formula text not null default '';
