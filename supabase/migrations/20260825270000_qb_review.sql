-- Review comments on invoices, expenses, and payments (Dropbox-style
-- notes). Accounting uses these when returning a record to the PM.
-- qb_status stays text; 'returned' means waiting on the project manager.

create table if not exists public.qb_review_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'expense', 'payment')),
  record_id uuid not null,
  body text not null,
  intent text not null default 'comment'
    check (intent in ('comment', 'return', 'approve', 'resubmit')),
  author_staff_id text not null default '',
  author_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists qb_review_comments_record_idx
  on public.qb_review_comments (company_id, kind, record_id, created_at);

alter table public.qb_review_comments enable row level security;

drop policy if exists "company isolation" on public.qb_review_comments;
create policy "company isolation" on public.qb_review_comments
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
