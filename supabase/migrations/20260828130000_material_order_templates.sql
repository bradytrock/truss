-- Company material-order templates: reusable supplier lists and quantities.
-- Independent of estimates. Unit costs copy from catalog_items when a line is added.

create table if not exists public.material_order_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text not null default '',
  vendor text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_order_templates_company_id_idx
  on public.material_order_templates (company_id);

create table if not exists public.material_order_template_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  template_id uuid not null references public.material_order_templates (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  name text not null,
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'EA',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists material_order_template_lines_template_id_idx
  on public.material_order_template_lines (template_id);

alter table public.material_order_templates enable row level security;
alter table public.material_order_template_lines enable row level security;

drop policy if exists "company isolation" on public.material_order_templates;
create policy "company isolation" on public.material_order_templates
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.material_order_template_lines;
create policy "company isolation" on public.material_order_template_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.material_order_templates to authenticated;
grant select, insert, update, delete on table public.material_order_template_lines to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.material_order_templates';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.material_order_template_lines';
exception
  when duplicate_object then null;
end $$;
