-- Training progress per seat, plus company training bulletins.

create table public.training_progress (
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  read jsonb not null default '{}'::jsonb,
  badges jsonb not null default '{}'::jsonb,
  attempts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (company_id, staff_id)
);

create table public.training_bulletins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  body text not null default '',
  author text not null default '',
  created_at timestamptz not null default now()
);

create index training_bulletins_company_idx on public.training_bulletins (company_id, created_at desc);

alter table public.training_progress enable row level security;
alter table public.training_bulletins enable row level security;

create policy "company isolation" on public.training_progress
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "company isolation" on public.training_bulletins
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
