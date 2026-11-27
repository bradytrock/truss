-- Change orders amend a signed estimate. The original proposal stays put.
-- Signing adds this document's total onto the job contract. It does not move the job.

create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete restrict,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  number text not null,
  reason text not null default '',
  notes text not null default '',
  status text not null default 'draft',
  tax_rate numeric(8, 4) not null default 0,
  base_total numeric(14, 2) not null default 0,
  share_token text not null default '',
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  signature_name text not null default '',
  signature_image text not null default '',
  invoice_id uuid references public.invoices (id) on delete set null,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_orders_status_check check (
    status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'void')
  )
);

create index if not exists change_orders_company_job_idx
  on public.change_orders (company_id, job_id);

create unique index if not exists change_orders_job_number_idx
  on public.change_orders (job_id, number);

create unique index if not exists change_orders_share_token_idx
  on public.change_orders (share_token)
  where share_token <> '';

create table if not exists public.change_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  change_order_id uuid not null references public.change_orders (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  title text not null default '',
  description text not null default '',
  quantity numeric(14, 2) not null default 1,
  unit text not null default 'EA',
  unit_cost numeric(14, 2) not null default 0,
  taxable boolean not null default true,
  sort_order integer not null default 0
);

create index if not exists change_order_lines_order_idx
  on public.change_order_lines (change_order_id, sort_order);

alter table public.change_orders enable row level security;
alter table public.change_order_lines enable row level security;

drop policy if exists "company isolation" on public.change_orders;
create policy "company isolation" on public.change_orders
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.change_order_lines;
create policy "company isolation" on public.change_order_lines
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.change_orders to authenticated;
grant select, insert, update, delete on table public.change_order_lines to authenticated;

create or replace function public.change_order_delta(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    coalesce((
      select sum(round(line.quantity * line.unit_cost, 2))
      from public.change_order_lines line
      where line.change_order_id = p_id
    ), 0)
    + coalesce((
      select round(
        coalesce(sum(round(line.quantity * line.unit_cost, 2)), 0) * co.tax_rate / 100.0,
        2
      )
      from public.change_order_lines line
      join public.change_orders co on co.id = line.change_order_id
      where line.change_order_id = p_id
        and line.taxable
      group by co.tax_rate
    ), 0),
    2
  );
$$;

revoke all on function public.change_order_delta(uuid) from public;
grant execute on function public.change_order_delta(uuid) to authenticated;

create or replace function public.shared_change_order(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  co public.change_orders%rowtype;
  est public.estimates%rowtype;
  job public.jobs%rowtype;
  company_name text;
  v_delta numeric(14, 2);
  v_others numeric(14, 2);
  v_before numeric(14, 2);
  v_after numeric(14, 2);
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;

  select * into co
  from public.change_orders
  where share_token = trim(p_token)
  limit 1;
  if not found or co.status = 'void' then
    return null;
  end if;

  if co.status = 'sent' then
    update public.change_orders
    set status = 'viewed', viewed_at = coalesce(viewed_at, now()), updated_at = now()
    where id = co.id
    returning * into co;
  end if;

  select * into est from public.estimates where id = co.estimate_id;
  select * into job from public.jobs where id = co.job_id;
  select c.name into company_name from public.companies c where c.id = co.company_id;

  v_delta := coalesce(public.change_order_delta(co.id), 0);
  select coalesce(sum(public.change_order_delta(other.id)), 0) into v_others
  from public.change_orders other
  where other.job_id = co.job_id
    and other.status = 'accepted'
    and other.id <> co.id;
  v_before := round(co.base_total + coalesce(v_others, 0), 2);
  if co.status in ('declined', 'void') then
    v_after := v_before;
  else
    v_after := round(v_before + v_delta, 2);
  end if;

  return jsonb_build_object(
    'number', co.number,
    'reason', co.reason,
    'notes', co.notes,
    'status', co.status,
    'taxRate', co.tax_rate,
    'baseTotal', co.base_total,
    'estimateNumber', coalesce(est.number, ''),
    'companyName', coalesce(company_name, ''),
    'jobName', coalesce(job.name, ''),
    'jobCode', coalesce(job.code, ''),
    'jobLocation', coalesce(job.location, ''),
    'signatureName', co.signature_name,
    'alreadySigned', co.status = 'accepted',
    'before', v_before,
    'delta', v_delta,
    'after', v_after,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', line.title,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'unitCost', line.unit_cost,
        'taxable', line.taxable,
        'sortOrder', line.sort_order
      ) order by line.sort_order, line.title)
      from public.change_order_lines line
      where line.change_order_id = co.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shared_change_order(text) from public;
grant execute on function public.shared_change_order(text) to anon, authenticated;

create or replace function public.sign_shared_change_order(
  p_token text,
  p_signer_name text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  co public.change_orders%rowtype;
  job public.jobs%rowtype;
  v_name text;
  v_revised numeric(14, 2);
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;

  v_name := trim(coalesce(p_signer_name, ''));
  if length(v_name) < 2 then
    raise exception 'Signer name is required';
  end if;
  if p_signature is null
     or p_signature not like 'data:image/png;base64,%'
     or length(p_signature) < 100
     or length(p_signature) > 200000 then
    raise exception 'A drawn signature is required';
  end if;

  select * into co
  from public.change_orders
  where share_token = trim(p_token)
  limit 1;
  if not found or co.status in ('void', 'declined') then
    return null;
  end if;
  if co.status = 'accepted' and coalesce(co.signature_image, '') <> '' then
    return public.shared_change_order(trim(p_token));
  end if;

  update public.change_orders
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now()),
    signature_name = v_name,
    signature_image = p_signature,
    updated_at = now()
  where id = co.id
  returning * into co;

  select coalesce(sum(public.change_order_delta(item.id)), 0) into v_revised
  from public.change_orders item
  where item.job_id = co.job_id
    and item.status = 'accepted';
  v_revised := round(co.base_total + coalesce(v_revised, 0), 2);

  update public.jobs
  set contract_value = v_revised
  where id = co.job_id
  returning * into job;

  if job.opportunity_id is not null then
    update public.opportunities
    set value = v_revised
    where id = job.opportunity_id;
  end if;

  return public.shared_change_order(trim(p_token));
end;
$$;

revoke all on function public.sign_shared_change_order(text, text, text) from public;
grant execute on function public.sign_shared_change_order(text, text, text) to anon, authenticated;

create or replace function public.decline_shared_change_order(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  co public.change_orders%rowtype;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;

  select * into co
  from public.change_orders
  where share_token = trim(p_token)
  limit 1;
  if not found or co.status in ('void', 'accepted', 'declined') then
    if found and co.status = 'declined' then
      return public.shared_change_order(trim(p_token));
    end if;
    return null;
  end if;

  update public.change_orders
  set status = 'declined', updated_at = now()
  where id = co.id;

  return public.shared_change_order(trim(p_token));
end;
$$;

revoke all on function public.decline_shared_change_order(text) from public;
grant execute on function public.decline_shared_change_order(text) to anon, authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.change_orders';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.change_order_lines';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
