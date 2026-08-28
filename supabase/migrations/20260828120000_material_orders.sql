-- Job material orders. Built by hand from the price book (or custom lines),
-- independent of the estimate or invoice. Unit costs copy from catalog_items.

create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  vendor text not null default '',
  notes text not null default '',
  needed_by date,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists material_orders_company_number_idx
  on public.material_orders (company_id, number);
create index if not exists material_orders_job_id_idx on public.material_orders (job_id);
create index if not exists material_orders_company_id_idx on public.material_orders (company_id);

create table if not exists public.material_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  material_order_id uuid not null references public.material_orders (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  name text not null,
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'EA',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists material_order_lines_order_id_idx
  on public.material_order_lines (material_order_id);

alter table public.material_orders enable row level security;
alter table public.material_order_lines enable row level security;

drop policy if exists "company isolation" on public.material_orders;
create policy "company isolation" on public.material_orders
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.material_order_lines;
create policy "company isolation" on public.material_order_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.material_orders to authenticated;
grant select, insert, update, delete on table public.material_order_lines to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.material_orders';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.material_order_lines';
exception
  when duplicate_object then null;
end $$;
