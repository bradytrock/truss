-- Named marketing lists. Membership points at real CRM contacts.

create table if not exists public.marketing_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  role text not null default 'other' check (role in ('realtor', 'insurance', 'homeowner', 'other')),
  created_by_staff_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_lists_company_idx
  on public.marketing_lists (company_id, created_at desc);

alter table public.marketing_lists enable row level security;

drop policy if exists "company isolation" on public.marketing_lists;
create policy "company isolation" on public.marketing_lists
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.marketing_list_members (
  list_id uuid not null references public.marketing_lists (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);

create index if not exists marketing_list_members_company_idx
  on public.marketing_list_members (company_id, list_id);

alter table public.marketing_list_members enable row level security;

drop policy if exists "company isolation" on public.marketing_list_members;
create policy "company isolation" on public.marketing_list_members
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

alter table public.email_campaigns
  add column if not exists audience_list_id uuid references public.marketing_lists (id) on delete set null;
