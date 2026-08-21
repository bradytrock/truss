-- Company estimate templates: reusable sections, lines, terms, and tax.

create table if not exists public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text not null default '',
  market text not null default 'residential',
  intro text not null default '',
  terms text not null default '',
  notes text not null default '',
  tax_rate numeric(6, 3) not null default 0,
  discount_kind text not null default 'percent',
  discount_value numeric(14, 2) not null default 0,
  deposit_kind text not null default 'percent',
  deposit_value numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_templates_company_id_idx on public.estimate_templates (company_id);

create table if not exists public.estimate_template_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  template_id uuid not null references public.estimate_templates (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  title text not null default '',
  description text not null default '',
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  group_name text not null default '',
  optional boolean not null default false,
  selected boolean not null default true,
  taxable boolean not null default true
);

create index if not exists estimate_template_lines_template_id_idx on public.estimate_template_lines (template_id);

alter table public.estimate_templates enable row level security;
alter table public.estimate_template_lines enable row level security;

drop policy if exists "company isolation" on public.estimate_templates;
create policy "company isolation" on public.estimate_templates
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.estimate_template_lines;
create policy "company isolation" on public.estimate_template_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
declare
  tbl text;
begin
  foreach tbl in array array['estimate_templates', 'estimate_template_lines']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;
