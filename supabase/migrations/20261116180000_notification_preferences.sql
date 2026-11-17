-- Per-person notification switches. Missing keys stay on.
-- Lead popups, storm warnings, and Stripe removal cannot be turned off.

create table if not exists public.notification_preferences (
  staff_id uuid primary key references public.team_members (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  channels jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists notification_preferences_company_idx
  on public.notification_preferences (company_id);

alter table public.notification_preferences enable row level security;

drop policy if exists "read company notification preferences" on public.notification_preferences;
create policy "read company notification preferences" on public.notification_preferences
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "write notification preferences" on public.notification_preferences;
create policy "write notification preferences" on public.notification_preferences
  for all to authenticated
  using (
    company_id = public.current_company_id()
    and (
      staff_id = public.current_staff_id()
      or public.current_is_company_admin()
    )
  )
  with check (
    company_id = public.current_company_id()
    and (
      staff_id = public.current_staff_id()
      or public.current_is_company_admin()
    )
  );

grant select, insert, update, delete on public.notification_preferences to authenticated;

comment on table public.notification_preferences is
  'Which email, text, and in-app alerts a seat still wants. Absent channels stay on.';

create or replace function public.notification_allows(
  p_staff_id uuid,
  p_kind text,
  p_channel text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind = 'weather_warning' and p_channel = 'text' then true
    when p_kind = 'stripe_revoke' and p_channel = 'email' then true
    when p_kind in (
      'lead_assigned_you',
      'lead_assigned_team',
      'lead_needs_rep',
      'lead_passed_back',
      'lead_rep_note'
    ) and p_channel = 'in_app' then true
    else coalesce(
      (
        select case
          when prefs.channels -> p_kind ->> p_channel is null then true
          else (prefs.channels -> p_kind ->> p_channel) = 'true'
        end
        from public.notification_preferences prefs
        where prefs.staff_id = p_staff_id
      ),
      true
    )
  end;
$$;

create or replace function public.notification_allows_email(
  p_email text,
  p_kind text,
  p_channel text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select bool_or(public.notification_allows(tm.id, p_kind, p_channel))
      from public.team_members tm
      where lower(trim(tm.email)) = lower(trim(coalesce(p_email, '')))
        and trim(coalesce(p_email, '')) <> ''
        and not tm.locked
    ),
    true
  );
$$;

revoke all on function public.notification_allows(uuid, text, text) from public;
revoke all on function public.notification_allows_email(text, text, text) from public;
grant execute on function public.notification_allows(uuid, text, text) to anon, authenticated;
grant execute on function public.notification_allows_email(text, text, text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.notification_preferences to service_role;
    grant execute on function public.notification_allows(uuid, text, text) to service_role;
    grant execute on function public.notification_allows_email(text, text, text) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
