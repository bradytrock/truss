-- Digital business card analytics: opens plus every tap on the card.
-- Guests are anonymous, so writes go through one security-definer function that
-- resolves the company and seat from the public slugs. Reads are company-scoped.
-- Safe to re-run.

create table if not exists public.card_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  kind text not null,
  detail text not null default '',
  ip_address text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists card_events_company_created_idx
  on public.card_events (company_id, created_at desc);
create index if not exists card_events_staff_kind_idx
  on public.card_events (staff_id, kind);

alter table public.card_events enable row level security;

drop policy if exists "company read" on public.card_events;
create policy "company read" on public.card_events
  for select to authenticated
  using (company_id = public.current_company_id());

grant select on table public.card_events to authenticated;

create or replace function public.record_card_event(
  p_company text,
  p_person text,
  p_kind text,
  p_detail text default '',
  p_ip text default '',
  p_user_agent text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_staff_id uuid;
  v_kind text;
begin
  v_kind := lower(trim(coalesce(p_kind, '')));
  if v_kind not in (
    'view', 'save_contact', 'review', 'call', 'text', 'email', 'website', 'social', 'payment'
  ) then
    return;
  end if;

  select id into v_company_id
  from public.companies
  where lower(slug) = lower(trim(coalesce(p_company, '')))
  limit 1;
  if v_company_id is null then
    return;
  end if;

  select id into v_staff_id
  from public.team_members
  where company_id = v_company_id
    and lower(card_slug) = lower(trim(coalesce(p_person, '')))
    and coalesce(locked, false) = false
  limit 1;
  if v_staff_id is null then
    return;
  end if;

  insert into public.card_events (
    company_id, staff_id, kind, detail, ip_address, user_agent
  )
  values (
    v_company_id,
    v_staff_id,
    v_kind,
    left(coalesce(p_detail, ''), 60),
    left(coalesce(p_ip, ''), 80),
    left(coalesce(p_user_agent, ''), 500)
  );
end;
$$;

alter function public.record_card_event(text, text, text, text, text, text) owner to postgres;
revoke all on function public.record_card_event(text, text, text, text, text, text) from public;
grant execute on function public.record_card_event(text, text, text, text, text, text)
  to anon, authenticated;

-- Totals per seat. Runs as the caller so RLS keeps it to their own company.
create or replace function public.card_event_totals(p_since timestamptz default null)
returns table (staff_id uuid, kind text, total bigint)
language sql
stable
as $$
  select e.staff_id, e.kind, count(*)::bigint as total
  from public.card_events e
  where e.company_id = public.current_company_id()
    and (p_since is null or e.created_at >= p_since)
  group by e.staff_id, e.kind;
$$;

revoke all on function public.card_event_totals(timestamptz) from public, anon;
grant execute on function public.card_event_totals(timestamptz) to authenticated;

notify pgrst, 'reload schema';
