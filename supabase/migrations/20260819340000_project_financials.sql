-- Project financials: expenses with required receipts, QuickBooks entry queue, accounting seat.

alter type public.seat_role add value if not exists 'accountant';

alter table public.invoices
  add column if not exists qb_status text not null default 'not_in_qb';

alter table public.payments
  alter column invoice_id drop not null;

alter table public.payments
  add column if not exists job_id uuid references public.jobs (id) on delete set null,
  add column if not exists receipt_url text not null default '',
  add column if not exists receipt_storage_path text,
  add column if not exists qb_status text not null default 'not_in_qb',
  add column if not exists created_by text not null default '';

create index if not exists payments_job_id_idx on public.payments (job_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  job_id uuid references public.jobs (id) on delete set null,
  vendor text not null default '',
  account text not null default 'materials',
  amount numeric(14, 2) not null default 0,
  incurred_at date not null default current_date,
  method text not null default 'credit_card',
  memo text not null default '',
  receipt_url text not null,
  receipt_storage_path text,
  qb_status text not null default 'not_in_qb',
  extracted_by_ai boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create unique index if not exists expenses_company_number_idx on public.expenses (company_id, number);
create index if not exists expenses_job_id_idx on public.expenses (job_id);
create index if not exists expenses_qb_status_idx on public.expenses (company_id, qb_status);

alter table public.expenses enable row level security;

drop policy if exists "company isolation" on public.expenses;
create policy "company isolation" on public.expenses
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.expenses';
  exception
    when duplicate_object then null;
  end;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "public read receipts" on storage.objects;
create policy "public read receipts"
on storage.objects for select
to public
using (bucket_id = 'receipts');

drop policy if exists "company receipt files" on storage.objects;
create policy "company receipt files"
on storage.objects for all to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);
