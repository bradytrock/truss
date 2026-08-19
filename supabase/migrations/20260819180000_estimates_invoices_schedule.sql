-- Estimates, price book, invoices, payments, schedule, and job photos.

create type public.catalog_kind as enum ('labor', 'material', 'equipment', 'allowance', 'subcontract');
create type public.estimate_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined');
create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'overdue', 'void');
create type public.event_kind as enum (
  'site_walk',
  'pre_bid',
  'inspection',
  'production',
  'meeting',
  'punch'
);
create type public.photo_category as enum ('before', 'progress', 'after', 'issue');

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  kind public.catalog_kind not null,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  cost_code text not null default '',
  created_at timestamptz not null default now()
);

create index catalog_items_company_id_idx on public.catalog_items (company_id);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  status public.estimate_status not null default 'draft',
  notes text not null default '',
  valid_until date,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index estimates_company_status_idx on public.estimates (company_id, status);
create unique index estimates_company_number_idx on public.estimates (company_id, number);

create table public.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  description text not null,
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index estimate_lines_estimate_id_idx on public.estimate_lines (estimate_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete set null,
  estimate_id uuid references public.estimates (id) on delete set null,
  status public.invoice_status not null default 'draft',
  issued_at date not null default current_date,
  due_at date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index invoices_company_status_idx on public.invoices (company_id, status);
create unique index invoices_company_number_idx on public.invoices (company_id, number);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'LS',
  unit_cost numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(14, 2) not null,
  method text not null default 'check',
  paid_at date not null default current_date,
  reference text not null default '',
  created_at timestamptz not null default now()
);

create index payments_invoice_id_idx on public.payments (invoice_id);

create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  kind public.event_kind not null default 'meeting',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '',
  assignee text not null default '',
  opportunity_id uuid references public.opportunities (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index schedule_events_company_starts_idx on public.schedule_events (company_id, starts_at);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  caption text not null default '',
  category public.photo_category not null default 'progress',
  taken_at date not null default current_date,
  image_url text not null,
  storage_path text,
  created_at timestamptz not null default now()
);

create index job_photos_job_id_idx on public.job_photos (job_id);

alter table public.catalog_items enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.schedule_events enable row level security;
alter table public.job_photos enable row level security;

create policy "company isolation" on public.catalog_items
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.estimates
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.estimate_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.invoices
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.invoice_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.payments
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.schedule_events
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.job_photos
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

alter publication supabase_realtime add table public.catalog_items;
alter publication supabase_realtime add table public.estimates;
alter publication supabase_realtime add table public.estimate_lines;
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.invoice_lines;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.schedule_events;
alter publication supabase_realtime add table public.job_photos;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "company photo files"
on storage.objects for all to authenticated
using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);
