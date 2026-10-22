-- Expense categories map to a QuickBooks chart account. Accounting can add a
-- category or point an existing one at a different account. Posting reads the
-- map; the case below is only the fallback when a row is missing.
--
-- Keep the seed in sync with CATEGORY_SEED in src/lib/expense-categories.ts.

create table if not exists public.qb_chart_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  account_number text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_chart_accounts_number_check check (btrim(account_number) <> ''),
  constraint qb_chart_accounts_name_check check (btrim(name) <> '')
);

create unique index if not exists qb_chart_accounts_company_number_key
  on public.qb_chart_accounts (company_id, account_number);

create index if not exists qb_chart_accounts_company_name_idx
  on public.qb_chart_accounts (company_id, lower(name));

alter table public.qb_chart_accounts enable row level security;

drop policy if exists "company isolation" on public.qb_chart_accounts;
create policy "company isolation" on public.qb_chart_accounts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.qb_chart_accounts to authenticated;

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  label text not null,
  chart_account_id uuid references public.qb_chart_accounts (id) on delete set null,
  qb_account_number text not null default '',
  qb_account_name text not null default '',
  section text not null default 'cost_of_sales',
  requires_job boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_key_check check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint expense_categories_label_check check (btrim(label) <> ''),
  constraint expense_categories_section_check check (section in ('cost_of_sales', 'operating', 'other'))
);

create unique index if not exists expense_categories_company_key_key
  on public.expense_categories (company_id, key);

create index if not exists expense_categories_chart_account_idx
  on public.expense_categories (chart_account_id);

alter table public.expense_categories enable row level security;

drop policy if exists "company isolation" on public.expense_categories;
create policy "company isolation" on public.expense_categories
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.expense_categories to authenticated;

create or replace function public.seed_expense_category_accounts(p_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company is null then
    return;
  end if;

  insert into public.qb_chart_accounts (company_id, account_number, name)
  select p_company, v.account_number, v.name
  from (
    values
      ('50400'::text, 'Construction Materials Costs'::text),
      ('53600'::text, 'Subcontractors Expense'::text),
      ('50800'::text, 'Equipment Rental for Jobs'::text),
      ('51900'::text, 'Other Construction Costs'::text),
      ('61000'::text, 'Business Licenses and Permits'::text),
      ('66000'::text, 'Payroll Expenses'::text),
      ('60100'::text, 'Auto and Truck Expenses'::text),
      ('64900'::text, 'Office Supplies'::text),
      ('63300'::text, 'Insurance Expense'::text)
  ) as v(account_number, name)
  on conflict (company_id, account_number) do nothing;

  insert into public.expense_categories (
    company_id,
    key,
    label,
    chart_account_id,
    qb_account_number,
    qb_account_name,
    section,
    requires_job,
    sort_order
  )
  select
    p_company,
    v.key,
    v.label,
    a.id,
    v.account_number,
    v.account_name,
    v.section,
    v.requires_job,
    v.sort_order
  from (
    values
      ('materials'::text, 'Job materials'::text, '50400'::text, 'Construction Materials Costs'::text, 'cost_of_sales'::text, true, 10),
      ('subcontractors'::text, 'Subcontractors'::text, '53600'::text, 'Subcontractors Expense'::text, 'cost_of_sales'::text, true, 20),
      ('equipment_rental'::text, 'Equipment rental'::text, '50800'::text, 'Equipment Rental for Jobs'::text, 'cost_of_sales'::text, true, 30),
      ('dumpsters'::text, 'Dumpsters / disposal'::text, '51900'::text, 'Other Construction Costs'::text, 'cost_of_sales'::text, true, 40),
      ('permits'::text, 'Permits & fees'::text, '61000'::text, 'Business Licenses and Permits'::text, 'cost_of_sales'::text, true, 50),
      ('labor'::text, 'Direct labor'::text, '66000'::text, 'Payroll Expenses'::text, 'cost_of_sales'::text, true, 60),
      ('fuel'::text, 'Fuel'::text, '60100'::text, 'Auto and Truck Expenses'::text, 'operating'::text, true, 70),
      ('office'::text, 'Office / overhead'::text, '64900'::text, 'Office Supplies'::text, 'operating'::text, false, 80),
      ('insurance'::text, 'Insurance'::text, '63300'::text, 'Insurance Expense'::text, 'operating'::text, false, 90),
      ('other'::text, 'Other'::text, '51900'::text, 'Other Construction Costs'::text, 'other'::text, true, 100)
  ) as v(key, label, account_number, account_name, section, requires_job, sort_order)
  join public.qb_chart_accounts a
    on a.company_id = p_company
   and a.account_number = v.account_number
  on conflict (company_id, key) do nothing;
end;
$$;

revoke all on function public.seed_expense_category_accounts(uuid) from public, anon, authenticated;

do $$
declare
  company record;
begin
  for company in select id from public.companies loop
    perform public.seed_expense_category_accounts(company.id);
  end loop;
end $$;

create or replace function public.seed_expense_categories_on_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_expense_category_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists seed_expense_categories on public.companies;
create trigger seed_expense_categories
  after insert on public.companies
  for each row execute function public.seed_expense_categories_on_company();

do $$
begin
  execute 'alter publication supabase_realtime add table public.qb_chart_accounts';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.expense_categories';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create or replace function public.qbwc_expense_payload(p_expense uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  exp public.expenses%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  conn public.qbwc_connectors%rowtype;
  v_customer text;
  v_phone text;
  v_account text;
  v_account_number text;
  v_pay text;
  v_pay_account text;
  v_has_job boolean;
  v_job_code text;
  v_replace text;
  v_replace_kind text;
begin
  select * into exp from public.expenses where id = p_expense;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = exp.job_id;
  select * into company from public.companies where id = exp.company_id;
  select * into conn from public.qbwc_connectors where company_id = exp.company_id;

  v_has_job := job.id is not null;
  v_job_code := case
    when not v_has_job then ''
    else coalesce(nullif(trim(job.code), ''), nullif(trim(job.name), ''), 'Job')
  end;

  select cat.qb_account_name, cat.qb_account_number
    into v_account, v_account_number
  from public.expense_categories cat
  where cat.company_id = exp.company_id
    and cat.key = exp.account
  limit 1;

  if coalesce(btrim(v_account), '') = '' or coalesce(btrim(v_account_number), '') = '' then
    v_account := case exp.account
      when 'materials' then 'Construction Materials Costs'
      when 'subcontractors' then 'Subcontractors Expense'
      when 'equipment_rental' then 'Equipment Rental for Jobs'
      when 'dumpsters' then 'Other Construction Costs'
      when 'permits' then 'Business Licenses and Permits'
      when 'labor' then 'Payroll Expenses'
      when 'fuel' then 'Auto and Truck Expenses'
      when 'office' then 'Office Supplies'
      when 'insurance' then 'Insurance Expense'
      else 'Other Construction Costs'
    end;
    v_account_number := case exp.account
      when 'materials' then '50400'
      when 'subcontractors' then '53600'
      when 'equipment_rental' then '50800'
      when 'dumpsters' then '51900'
      when 'permits' then '61000'
      when 'labor' then '66000'
      when 'fuel' then '60100'
      when 'office' then '64900'
      when 'insurance' then '63300'
      else '51900'
    end;
  end if;
  v_pay := case when exp.method = 'credit_card' then 'credit_card' else 'bill' end;
  v_pay_account := case
    when v_pay = 'credit_card' then coalesce(nullif(trim(conn.cc_account_name), ''), 'Credit Card')
    else 'Accounts Payable'
  end;
  v_replace := case
    when v_pay = 'bill' and coalesce(exp.qb_txn_id, '') <> ''
      and coalesce(exp.qb_txn_kind, '') in ('', 'check', 'bill')
    then exp.qb_txn_id
    else ''
  end;
  v_replace_kind := case
    when v_replace = '' then ''
    when exp.qb_txn_kind = 'bill' then 'bill'
    else 'check'
  end;

  if v_has_job then
    v_customer := coalesce(
      (select name from public.clients where id = (
        select client_id from public.invoices where job_id = job.id and client_id is not null limit 1
      )),
      (select name from public.contacts where id = job.primary_contact_id),
      (select c.name
         from public.opportunities o
         join public.contacts c on c.id = o.primary_contact_id
        where o.id = job.opportunity_id),
      (select name from public.clients where id = (
        select client_id from public.opportunities where id = job.opportunity_id
      )),
      'Homeowner'
    );
  else
    v_customer := '';
  end if;
  v_phone := coalesce(
    (select phone from public.contacts where id = job.primary_contact_id),
    company.phone,
    ''
  );

  return jsonb_build_object(
    'kind', 'expense',
    'expenseId', exp.id,
    'number', exp.number,
    'invoiceNumber', coalesce(exp.invoice_number, ''),
    'vendor', exp.vendor,
    'accountName', v_account,
    'accountNumber', v_account_number,
    'amount', exp.amount,
    'payWith', v_pay,
    'txnDate', exp.incurred_at,
    'memo', coalesce(exp.memo, ''),
    'payAccount', v_pay_account,
    'customerName', v_customer,
    'jobId', job.id,
    'jobCode', v_job_code,
    'jobName', coalesce(job.name, ''),
    'street', coalesce(job.street, ''),
    'city', coalesce(job.city, ''),
    'state', coalesce(job.state, ''),
    'postalCode', coalesce(job.postal_code, ''),
    'phone', coalesce(v_phone, ''),
    'hasJob', v_has_job,
    'replaceTxnId', v_replace,
    'replaceTxnKind', v_replace_kind
  );
end;
$$;


notify pgrst, 'reload schema';
