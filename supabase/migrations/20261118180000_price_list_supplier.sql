-- A price list belongs to the supplier it was ordered from.
-- A blank vendor is the company book, used until that supplier has its own list.
-- A new list outdates earlier lists for the same supplier only.

alter table public.price_lists
  add column if not exists vendor text not null default '';

create index if not exists price_lists_company_vendor_idx
  on public.price_lists (company_id, vendor);

notify pgrst, 'reload schema';
