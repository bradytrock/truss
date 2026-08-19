-- Company business profile: phone, email, address, license.
-- Used by Settings and shown on estimates / invoices.

alter table public.companies
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists website text not null default '',
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists license_number text not null default '',
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "update own company" on public.companies;
drop policy if exists "admins update company" on public.companies;

create policy "admins update company" on public.companies
  for update to authenticated
  using (
    id = public.current_company_id()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'company_admin'
    )
  )
  with check (
    id = public.current_company_id()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'company_admin'
    )
  );
