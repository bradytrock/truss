-- EagleView Measurement Orders: company connector + per-job orders.
-- Safe to re-run.

create table if not exists public.eagleview_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  client_id text not null default '',
  client_secret text not null default '',
  sandbox boolean not null default true,
  default_product text not null default 'premium_residential',
  webhook_token text not null default '',
  linked boolean not null default false,
  linked_at timestamptz,
  access_token text not null default '',
  token_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.eagleview_connections add column if not exists client_id text;
alter table public.eagleview_connections add column if not exists client_secret text;
alter table public.eagleview_connections add column if not exists sandbox boolean;
alter table public.eagleview_connections add column if not exists default_product text;
alter table public.eagleview_connections add column if not exists webhook_token text;
alter table public.eagleview_connections add column if not exists linked boolean;
alter table public.eagleview_connections add column if not exists linked_at timestamptz;
alter table public.eagleview_connections add column if not exists access_token text;
alter table public.eagleview_connections add column if not exists token_expires_at timestamptz;
alter table public.eagleview_connections add column if not exists updated_at timestamptz;
alter table public.eagleview_connections add column if not exists created_at timestamptz;

update public.eagleview_connections set client_id = coalesce(client_id, '') where client_id is null;
update public.eagleview_connections set client_secret = coalesce(client_secret, '') where client_secret is null;
update public.eagleview_connections set sandbox = coalesce(sandbox, true) where sandbox is null;
update public.eagleview_connections set default_product = coalesce(nullif(default_product, ''), 'premium_residential') where default_product is null or default_product = '';
update public.eagleview_connections set webhook_token = coalesce(webhook_token, '') where webhook_token is null;
update public.eagleview_connections set linked = coalesce(linked, false) where linked is null;
update public.eagleview_connections set access_token = coalesce(access_token, '') where access_token is null;
update public.eagleview_connections set updated_at = coalesce(updated_at, now()) where updated_at is null;
update public.eagleview_connections set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.eagleview_connections alter column client_id set default '';
alter table public.eagleview_connections alter column client_id set not null;
alter table public.eagleview_connections alter column client_secret set default '';
alter table public.eagleview_connections alter column client_secret set not null;
alter table public.eagleview_connections alter column sandbox set default true;
alter table public.eagleview_connections alter column sandbox set not null;
alter table public.eagleview_connections alter column default_product set default 'premium_residential';
alter table public.eagleview_connections alter column default_product set not null;
alter table public.eagleview_connections alter column webhook_token set default '';
alter table public.eagleview_connections alter column webhook_token set not null;
alter table public.eagleview_connections alter column linked set default false;
alter table public.eagleview_connections alter column linked set not null;
alter table public.eagleview_connections alter column access_token set default '';
alter table public.eagleview_connections alter column access_token set not null;
alter table public.eagleview_connections alter column updated_at set default now();
alter table public.eagleview_connections alter column updated_at set not null;
alter table public.eagleview_connections alter column created_at set default now();
alter table public.eagleview_connections alter column created_at set not null;

alter table public.eagleview_connections enable row level security;

drop policy if exists "company isolation" on public.eagleview_connections;
create policy "company isolation" on public.eagleview_connections
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.eagleview_connections to authenticated;

create table if not exists public.eagleview_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  estimate_id uuid references public.estimates (id) on delete set null,
  reference_id text not null default '',
  eagleview_order_id text not null default '',
  eagleview_report_id text not null default '',
  product text not null default 'premium_residential',
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'ready', 'failed', 'cancelled')),
  status_detail text not null default '',
  address_line text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  claim_number text not null default '',
  total_squares numeric,
  waste_percent numeric,
  pitch_summary text not null default '',
  measurements jsonb not null default '{}'::jsonb,
  report_file_id uuid references public.job_files (id) on delete set null,
  report_url text not null default '',
  applied_estimate_id uuid references public.estimates (id) on delete set null,
  applied_at timestamptz,
  mocked boolean not null default false,
  ordered_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.eagleview_orders add column if not exists estimate_id uuid;
alter table public.eagleview_orders add column if not exists reference_id text;
alter table public.eagleview_orders add column if not exists eagleview_order_id text;
alter table public.eagleview_orders add column if not exists eagleview_report_id text;
alter table public.eagleview_orders add column if not exists product text;
alter table public.eagleview_orders add column if not exists status text;
alter table public.eagleview_orders add column if not exists status_detail text;
alter table public.eagleview_orders add column if not exists address_line text;
alter table public.eagleview_orders add column if not exists city text;
alter table public.eagleview_orders add column if not exists state text;
alter table public.eagleview_orders add column if not exists postal_code text;
alter table public.eagleview_orders add column if not exists claim_number text;
alter table public.eagleview_orders add column if not exists total_squares numeric;
alter table public.eagleview_orders add column if not exists waste_percent numeric;
alter table public.eagleview_orders add column if not exists pitch_summary text;
alter table public.eagleview_orders add column if not exists measurements jsonb;
alter table public.eagleview_orders add column if not exists report_file_id uuid;
alter table public.eagleview_orders add column if not exists report_url text;
alter table public.eagleview_orders add column if not exists applied_estimate_id uuid;
alter table public.eagleview_orders add column if not exists applied_at timestamptz;
alter table public.eagleview_orders add column if not exists mocked boolean;
alter table public.eagleview_orders add column if not exists ordered_by text;
alter table public.eagleview_orders add column if not exists created_at timestamptz;
alter table public.eagleview_orders add column if not exists updated_at timestamptz;

update public.eagleview_orders set reference_id = coalesce(reference_id, '') where reference_id is null;
update public.eagleview_orders set eagleview_order_id = coalesce(eagleview_order_id, '') where eagleview_order_id is null;
update public.eagleview_orders set eagleview_report_id = coalesce(eagleview_report_id, '') where eagleview_report_id is null;
update public.eagleview_orders set product = coalesce(nullif(product, ''), 'premium_residential') where product is null or product = '';
update public.eagleview_orders set status = coalesce(nullif(status, ''), 'queued') where status is null or status = '';
update public.eagleview_orders set status_detail = coalesce(status_detail, '') where status_detail is null;
update public.eagleview_orders set address_line = coalesce(address_line, '') where address_line is null;
update public.eagleview_orders set city = coalesce(city, '') where city is null;
update public.eagleview_orders set state = coalesce(state, '') where state is null;
update public.eagleview_orders set postal_code = coalesce(postal_code, '') where postal_code is null;
update public.eagleview_orders set claim_number = coalesce(claim_number, '') where claim_number is null;
update public.eagleview_orders set pitch_summary = coalesce(pitch_summary, '') where pitch_summary is null;
update public.eagleview_orders set measurements = coalesce(measurements, '{}'::jsonb) where measurements is null;
update public.eagleview_orders set report_url = coalesce(report_url, '') where report_url is null;
update public.eagleview_orders set mocked = coalesce(mocked, false) where mocked is null;
update public.eagleview_orders set ordered_by = coalesce(ordered_by, '') where ordered_by is null;
update public.eagleview_orders set created_at = coalesce(created_at, now()) where created_at is null;
update public.eagleview_orders set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.eagleview_orders alter column reference_id set default '';
alter table public.eagleview_orders alter column reference_id set not null;
alter table public.eagleview_orders alter column eagleview_order_id set default '';
alter table public.eagleview_orders alter column eagleview_order_id set not null;
alter table public.eagleview_orders alter column eagleview_report_id set default '';
alter table public.eagleview_orders alter column eagleview_report_id set not null;
alter table public.eagleview_orders alter column product set default 'premium_residential';
alter table public.eagleview_orders alter column product set not null;
alter table public.eagleview_orders alter column status set default 'queued';
alter table public.eagleview_orders alter column status set not null;
alter table public.eagleview_orders alter column status_detail set default '';
alter table public.eagleview_orders alter column status_detail set not null;
alter table public.eagleview_orders alter column address_line set default '';
alter table public.eagleview_orders alter column address_line set not null;
alter table public.eagleview_orders alter column city set default '';
alter table public.eagleview_orders alter column city set not null;
alter table public.eagleview_orders alter column state set default '';
alter table public.eagleview_orders alter column state set not null;
alter table public.eagleview_orders alter column postal_code set default '';
alter table public.eagleview_orders alter column postal_code set not null;
alter table public.eagleview_orders alter column claim_number set default '';
alter table public.eagleview_orders alter column claim_number set not null;
alter table public.eagleview_orders alter column pitch_summary set default '';
alter table public.eagleview_orders alter column pitch_summary set not null;
alter table public.eagleview_orders alter column measurements set default '{}'::jsonb;
alter table public.eagleview_orders alter column measurements set not null;
alter table public.eagleview_orders alter column report_url set default '';
alter table public.eagleview_orders alter column report_url set not null;
alter table public.eagleview_orders alter column mocked set default false;
alter table public.eagleview_orders alter column mocked set not null;
alter table public.eagleview_orders alter column ordered_by set default '';
alter table public.eagleview_orders alter column ordered_by set not null;
alter table public.eagleview_orders alter column created_at set default now();
alter table public.eagleview_orders alter column created_at set not null;
alter table public.eagleview_orders alter column updated_at set default now();
alter table public.eagleview_orders alter column updated_at set not null;

create index if not exists eagleview_orders_company_idx on public.eagleview_orders (company_id);
create index if not exists eagleview_orders_job_idx on public.eagleview_orders (job_id);
create index if not exists eagleview_orders_reference_idx on public.eagleview_orders (reference_id);
create index if not exists eagleview_orders_report_idx on public.eagleview_orders (eagleview_report_id);

alter table public.eagleview_orders enable row level security;

drop policy if exists "company isolation" on public.eagleview_orders;
create policy "company isolation" on public.eagleview_orders
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.eagleview_orders to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.eagleview_orders';
exception
  when duplicate_object then null;
end $$;

-- Public webhook ingest (token-gated). EagleView often hits GET with query params.
create or replace function public.eagleview_ingest_webhook(
  p_token text,
  p_reference_id text default '',
  p_report_id text default '',
  p_order_id text default '',
  p_status_id integer default null,
  p_status_detail text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.eagleview_connections%rowtype;
  v_order public.eagleview_orders%rowtype;
  v_status text;
  v_detail text;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;

  select * into v_conn
  from public.eagleview_connections
  where webhook_token = trim(p_token)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_order
  from public.eagleview_orders
  where company_id = v_conn.company_id
    and (
      (coalesce(trim(p_reference_id), '') <> '' and reference_id = trim(p_reference_id))
      or (coalesce(trim(p_report_id), '') <> '' and eagleview_report_id = trim(p_report_id))
      or (coalesce(trim(p_order_id), '') <> '' and eagleview_order_id = trim(p_order_id))
    )
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  v_status := v_order.status;
  if p_status_id = 5 then
    v_status := 'ready';
  elsif p_status_id = 6 then
    v_status := 'failed';
  elsif p_status_id is not null then
    v_status := 'in_progress';
  end if;

  v_detail := coalesce(nullif(trim(p_status_detail), ''), v_order.status_detail);
  if p_status_id is not null and coalesce(nullif(trim(p_status_detail), ''), '') = '' then
    v_detail := 'EagleView status ' || p_status_id::text;
  end if;

  update public.eagleview_orders
  set
    status = v_status,
    status_detail = v_detail,
    eagleview_report_id = case
      when coalesce(trim(p_report_id), '') <> '' then trim(p_report_id)
      else eagleview_report_id
    end,
    eagleview_order_id = case
      when coalesce(trim(p_order_id), '') <> '' then trim(p_order_id)
      else eagleview_order_id
    end,
    updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'orderId', v_order.id,
    'status', v_order.status,
    'reportId', v_order.eagleview_report_id
  );
end;
$$;

revoke all on function public.eagleview_ingest_webhook(text, text, text, text, integer, text) from public;
grant execute on function public.eagleview_ingest_webhook(text, text, text, text, integer, text) to anon, authenticated, service_role;
