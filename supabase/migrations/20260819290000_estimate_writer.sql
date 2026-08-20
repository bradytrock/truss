-- Joist-style estimate writing: tax, discount, deposit, terms, sections, optional lines.

alter table public.estimates
  add column if not exists contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists tax_rate numeric(6, 3) not null default 0,
  add column if not exists discount_kind text not null default 'percent',
  add column if not exists discount_value numeric(14, 2) not null default 0,
  add column if not exists deposit_kind text not null default 'percent',
  add column if not exists deposit_value numeric(14, 2) not null default 0,
  add column if not exists intro text not null default '',
  add column if not exists terms text not null default '',
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '';

alter table public.estimate_lines
  add column if not exists title text not null default '',
  add column if not exists group_name text not null default '',
  add column if not exists optional boolean not null default false,
  add column if not exists selected boolean not null default true,
  add column if not exists taxable boolean not null default true;

update public.estimate_lines
set title = description
where title = '' and description <> '';
