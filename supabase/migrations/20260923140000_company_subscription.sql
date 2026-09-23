-- Desk access requires an active company subscription.
-- Existing workspaces stay on. New self-serve companies start off until we turn them on.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'companies'
      and column_name = 'subscription_active'
  ) then
    alter table public.companies
      add column subscription_active boolean not null default true;
    alter table public.companies
      alter column subscription_active set default false;
  end if;
end;
$$;

create or replace function public.keep_company_subscription()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.subscription_active := old.subscription_active;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_company_subscription on public.companies;
create trigger keep_company_subscription
  before update on public.companies
  for each row execute function public.keep_company_subscription();

create or replace function public.company_subscription_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.subscription_active
      from public.profiles p
      join public.companies c on c.id = p.company_id
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

revoke all on function public.company_subscription_active() from public;
grant execute on function public.company_subscription_active() to authenticated;

comment on column public.companies.subscription_active is
  'Host-managed. False until the company has an active TheRoofingCRM subscription.';
