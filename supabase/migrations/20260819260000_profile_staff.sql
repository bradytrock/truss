-- Tie each signed-in profile to its own team_members seat so login never
-- falls back onto a sample company_admin (Jordan Hale).

alter table public.profiles
  add column if not exists staff_id uuid references public.team_members (id) on delete set null;

create index if not exists profiles_staff_id_idx on public.profiles (staff_id);

insert into public.team_members (company_id, name, title, role, initials)
select p.company_id, p.full_name, p.title, p.role, p.initials
from public.profiles p
where not exists (
  select 1
  from public.team_members tm
  where tm.company_id = p.company_id
    and lower(tm.name) = lower(p.full_name)
);

update public.profiles p
set staff_id = tm.id
from public.team_members tm
where p.staff_id is null
  and tm.company_id = p.company_id
  and lower(tm.name) = lower(p.full_name);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  new_staff_id uuid;
  full_name text;
  title text;
  company_name text;
  initials text;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  title := coalesce(nullif(trim(new.raw_user_meta_data->>'title'), ''), 'Company admin');
  company_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company'), ''), 'Northline Construction');
  initials := upper(left(regexp_replace(full_name, '\s+', ' ', 'g'), 1))
    || coalesce(upper(left(split_part(full_name, ' ', 2), 1)), '');

  insert into public.companies (name)
  values (company_name)
  returning id into new_company_id;

  insert into public.team_members (company_id, name, title, role, initials)
  values (new_company_id, full_name, title, 'company_admin', initials)
  returning id into new_staff_id;

  insert into public.profiles (id, company_id, full_name, title, initials, role, staff_id)
  values (
    new.id,
    new_company_id,
    full_name,
    title,
    initials,
    'company_admin',
    new_staff_id
  );

  return new;
end;
$$;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.staff_id
      from public.profiles p
      where p.id = auth.uid()
        and p.staff_id is not null
    ),
    (
      select tm.id
      from public.profiles p
      join public.team_members tm
        on tm.company_id = p.company_id
       and lower(tm.name) = lower(p.full_name)
      where p.id = auth.uid()
      limit 1
    )
  )
$$;
