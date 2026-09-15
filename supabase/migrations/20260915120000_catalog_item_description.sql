-- Price book items can carry a proposal description that copies onto
-- new estimate and template lines. Existing items stay blank until written.
alter table public.catalog_items
  add column if not exists description text not null default '';

update public.estimate_lines
set description = ''
where trim(description) ilike 'new item';

update public.estimate_template_lines
set description = ''
where trim(description) ilike 'new item';
