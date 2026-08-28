-- Dated price lists. A new list becomes current; the previous list is
-- outdated and kept for lookup. Catalog items belong to one list.
-- Do not set catalog_items.price_list_id NOT NULL so a missing column
-- still loads in this browser until this SQL runs.

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  effective_on date not null,
  outdated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists price_lists_company_id_idx on public.price_lists (company_id);
create index if not exists price_lists_company_effective_idx
  on public.price_lists (company_id, effective_on desc);

alter table public.catalog_items
  add column if not exists price_list_id uuid references public.price_lists (id) on delete restrict;

create index if not exists catalog_items_price_list_id_idx on public.catalog_items (price_list_id);

alter table public.price_lists enable row level security;

drop policy if exists "company isolation" on public.price_lists;
create policy "company isolation" on public.price_lists
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.price_lists to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.price_lists';
exception
  when duplicate_object then null;
end $$;

insert into public.price_lists (company_id, name, effective_on)
select c.id, 'Price list', current_date
from public.companies c
where not exists (
  select 1 from public.price_lists p where p.company_id = c.id
);

update public.catalog_items ci
set price_list_id = (
  select p.id
  from public.price_lists p
  where p.company_id = ci.company_id
    and p.outdated_at is null
  order by p.effective_on desc, p.created_at desc
  limit 1
)
where ci.price_list_id is null;
