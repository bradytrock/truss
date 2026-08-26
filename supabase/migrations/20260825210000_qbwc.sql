-- QuickBooks Web Connector: push approved (non-draft) invoices with line items
-- onto Customer:Job in QuickBooks Desktop so accounting does not retype them.
-- pgcrypto (crypt/gen_salt) lives in the extensions schema on hosted Supabase.

create extension if not exists pgcrypto;

create table if not exists public.qbwc_connectors (
  company_id uuid primary key references public.companies (id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  owner_id uuid not null default gen_random_uuid(),
  file_id uuid not null default gen_random_uuid(),
  default_item_name text not null default 'Contract work',
  enabled boolean not null default true,
  last_connected_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qbwc_sessions (
  ticket uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  step text not null default 'customer_query',
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qbwc_sessions_company_idx on public.qbwc_sessions (company_id, created_at desc);

alter table public.invoices
  add column if not exists qb_txn_id text not null default '';

alter table public.qbwc_connectors enable row level security;
alter table public.qbwc_sessions enable row level security;

drop policy if exists "company isolation" on public.qbwc_connectors;
create policy "company isolation" on public.qbwc_connectors
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "no client access" on public.qbwc_sessions;
create policy "no client access" on public.qbwc_sessions
  for all to authenticated
  using (false)
  with check (false);

create or replace function public.qbwc_upsert_connector(p_password text, p_item_name text default 'Contract work')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company uuid;
  v_row public.qbwc_connectors%rowtype;
  v_item text;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'Not signed in';
  end if;
  v_item := coalesce(nullif(trim(p_item_name), ''), 'Contract work');
  select * into v_row from public.qbwc_connectors where company_id = v_company;
  if not found then
    if coalesce(p_password, '') = '' then
      raise exception 'Set a Web Connector password';
    end if;
    insert into public.qbwc_connectors (company_id, username, password_hash, default_item_name)
    values (
      v_company,
      'truss_' || substr(replace(v_company::text, '-', ''), 1, 12),
      crypt(p_password, gen_salt('bf'::text)),
      v_item
    )
    returning * into v_row;
  else
    update public.qbwc_connectors
    set
      password_hash = case
        when coalesce(p_password, '') = '' then password_hash
        else crypt(p_password, gen_salt('bf'::text))
      end,
      default_item_name = v_item,
      enabled = true,
      updated_at = now()
    where company_id = v_company
    returning * into v_row;
  end if;
  return jsonb_build_object(
    'username', v_row.username,
    'ownerId', v_row.owner_id,
    'fileId', v_row.file_id,
    'itemName', v_row.default_item_name,
    'enabled', v_row.enabled,
    'lastConnectedAt', v_row.last_connected_at,
    'lastError', v_row.last_error
  );
end;
$$;

create or replace function public.qbwc_authenticate(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.qbwc_connectors%rowtype;
  v_ticket uuid;
begin
  if coalesce(p_username, '') = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  select * into v_row
  from public.qbwc_connectors
  where username = trim(p_username)
    and enabled
    and password_hash = crypt(p_password, password_hash)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'nvu');
  end if;
  delete from public.qbwc_sessions where company_id = v_row.company_id;
  insert into public.qbwc_sessions (company_id)
  values (v_row.company_id)
  returning ticket into v_ticket;
  update public.qbwc_connectors
  set last_connected_at = now(), last_error = '', updated_at = now()
  where company_id = v_row.company_id;
  return jsonb_build_object('ok', true, 'ticket', v_ticket, 'companyId', v_row.company_id);
end;
$$;

create or replace function public.qbwc_pick_invoice(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select inv.id into v_id
  from public.invoices inv
  where inv.company_id = p_company
    and inv.qb_status = 'queued'
    and inv.status not in ('draft', 'void')
    and inv.job_id is not null
    and exists (
      select 1 from public.invoice_lines line where line.invoice_id = inv.id
    )
  order by inv.issued_at, inv.number
  limit 1;
  return v_id;
end;
$$;

create or replace function public.qbwc_invoice_payload(p_invoice uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  v_customer text;
  v_phone text;
  v_item text;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = inv.job_id;
  select * into company from public.companies where id = inv.company_id;
  select default_item_name into v_item from public.qbwc_connectors where company_id = inv.company_id;
  v_item := coalesce(nullif(trim(v_item), ''), 'Contract work');

  v_customer := coalesce(
    (select name from public.clients where id = inv.client_id),
    (select name from public.contacts where id = job.primary_contact_id),
    (select c.name
       from public.opportunities o
       join public.contacts c on c.id = o.primary_contact_id
      where o.id = job.opportunity_id),
    'Homeowner'
  );
  v_phone := coalesce(
    (select phone from public.contacts where id = job.primary_contact_id),
    company.phone,
    ''
  );

  return jsonb_build_object(
    'invoiceId', inv.id,
    'number', inv.number,
    'name', inv.name,
    'issuedAt', inv.issued_at,
    'dueAt', inv.due_at,
    'notes', inv.notes,
    'customerName', v_customer,
    'jobCode', coalesce(job.code, ''),
    'jobName', coalesce(job.name, ''),
    'street', coalesce(job.street, ''),
    'city', coalesce(job.city, ''),
    'state', coalesce(job.state, ''),
    'postalCode', coalesce(job.postal_code, ''),
    'phone', coalesce(v_phone, ''),
    'itemName', v_item,
    'lines', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'description', line.description,
          'quantity', line.quantity,
          'unit', line.unit,
          'unitCost', line.unit_cost
        ) order by line.sort_order
      ), '[]'::jsonb)
      from public.invoice_lines line
      where line.invoice_id = inv.id
    )
  );
end;
$$;

create or replace function public.qbwc_next_work(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  v_invoice uuid;
  v_payload jsonb;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;
  if sess.invoice_id is null then
    v_invoice := public.qbwc_pick_invoice(sess.company_id);
    if v_invoice is null then
      return jsonb_build_object('ok', true, 'done', true);
    end if;
    update public.qbwc_sessions
    set invoice_id = v_invoice, step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket
    returning * into sess;
  end if;
  v_payload := public.qbwc_invoice_payload(sess.invoice_id);
  if v_payload is null then
    update public.qbwc_sessions
    set invoice_id = null, step = 'customer_query', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'done', true);
  end if;
  return jsonb_build_object(
    'ok', true,
    'done', false,
    'ticket', sess.ticket,
    'step', sess.step,
    'work', v_payload
  );
end;
$$;

create or replace function public.qbwc_apply_response(
  p_ticket uuid,
  p_action text,
  p_next_step text default '',
  p_txn_id text default '',
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if p_action = 'next' and coalesce(p_next_step, '') <> '' then
    update public.qbwc_sessions
    set step = p_next_step, last_error = '', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'complete' and sess.invoice_id is not null then
    update public.invoices
    set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
    where id = sess.invoice_id;
    update public.qbwc_sessions
    set invoice_id = null, step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = '', updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true, 'entered', sess.invoice_id);
  end if;

  if p_action = 'fail' then
    if sess.invoice_id is not null then
      update public.invoices
      set qb_status = 'error'
      where id = sess.invoice_id;
    end if;
    update public.qbwc_sessions
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'),
        invoice_id = null,
        step = 'customer_query',
        updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'), updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true, 'failed', sess.invoice_id);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'action');
end;
$$;

create or replace function public.qbwc_get_last_error(p_ticket uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text;
begin
  select last_error into v_error from public.qbwc_sessions where ticket = p_ticket;
  if v_error is null then
    return 'That Web Connector session is no longer open. Run the application again.';
  end if;
  if v_error = '' then
    return '';
  end if;
  return v_error;
end;
$$;

create or replace function public.qbwc_close(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.qbwc_sessions where ticket = p_ticket;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.qbwc_upsert_connector(text, text) from public;
grant execute on function public.qbwc_upsert_connector(text, text) to authenticated;

revoke all on function public.qbwc_authenticate(text, text) from public;
grant execute on function public.qbwc_authenticate(text, text) to anon, authenticated;

revoke all on function public.qbwc_pick_invoice(uuid) from public;

revoke all on function public.qbwc_invoice_payload(uuid) from public;

revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;

revoke all on function public.qbwc_apply_response(uuid, text, text, text, text) from public;
grant execute on function public.qbwc_apply_response(uuid, text, text, text, text) to anon, authenticated;

revoke all on function public.qbwc_get_last_error(uuid) from public;
grant execute on function public.qbwc_get_last_error(uuid) to anon, authenticated;

revoke all on function public.qbwc_close(uuid) from public;
grant execute on function public.qbwc_close(uuid) to anon, authenticated;
