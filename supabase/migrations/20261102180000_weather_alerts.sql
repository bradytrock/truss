-- Storm desk: remember which warning was already texted so a 5-minute poll
-- does not page the crew again.

create table if not exists public.weather_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  source_id text not null,
  channel text not null default 'sms',
  headline text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (company_id, source_id, channel)
);

create index if not exists weather_notices_company_idx
  on public.weather_notices (company_id, created_at desc);

create table if not exists public.weather_receipts (
  notice_id uuid not null references public.weather_notices (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (notice_id, staff_id)
);

alter table public.weather_notices enable row level security;
alter table public.weather_receipts enable row level security;

drop policy if exists "company isolation" on public.weather_notices;
create policy "company isolation" on public.weather_notices
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.weather_receipts;
create policy "company isolation" on public.weather_receipts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on public.weather_notices to authenticated;
grant select, insert, update, delete on public.weather_receipts to authenticated;

comment on table public.weather_notices is
  'One row per NWS alert, lightning bucket, or morning outlook that the storm desk has handled.';
comment on table public.weather_receipts is
  'Who already received that storm text. The cron uses this so a warning is not sent twice.';

notify pgrst, 'reload schema';
