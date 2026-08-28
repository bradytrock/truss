-- Per-item catalog margin, plus a company floor applied when a catalog item
-- is dropped onto a proposal. Material orders still copy unit cost.

alter table public.companies
  add column if not exists minimum_margin_percent numeric(8, 2) not null default 0;

alter table public.catalog_items
  add column if not exists margin_percent numeric(8, 2) not null default 0;
