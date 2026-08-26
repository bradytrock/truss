-- Pull QuickBooks Desktop vendors into Truss so expense payees are a dropdown
-- of names that already exist in the company file.

create table if not exists public.qb_vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  list_id text not null default '',
  name text not null,
  is_active boolean not null default true,
  synced_at timestamptz not null default now()
);

create unique index if not exists qb_vendors_company_list_id_idx
  on public.qb_vendors (company_id, list_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qb_vendors_company_list_id_key'
  ) then
    alter table public.qb_vendors
      add constraint qb_vendors_company_list_id_key unique using index qb_vendors_company_list_id_idx;
  end if;
end $$;

create index if not exists qb_vendors_company_name_idx
  on public.qb_vendors (company_id, lower(name));

alter table public.qb_vendors enable row level security;

drop policy if exists "company isolation" on public.qb_vendors;
create policy "company isolation" on public.qb_vendors
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

alter table public.qbwc_connectors
  add column if not exists vendor_sync_requested boolean not null default true;

alter table public.qbwc_connectors
  add column if not exists vendors_synced_at timestamptz;

alter table public.qbwc_sessions
  add column if not exists vendor_sync boolean not null default false;

alter table public.qbwc_sessions
  add column if not exists vendor_iterator_id text not null default '';

alter table public.qbwc_sessions
  add column if not exists vendor_sync_started_at timestamptz;

create or replace function public.qbwc_request_vendor_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'Not signed in';
  end if;
  update public.qbwc_connectors
  set vendor_sync_requested = true, updated_at = now()
  where company_id = v_company;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'connector');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.qbwc_save_vendors(
  p_ticket uuid,
  p_vendors jsonb default '[]'::jsonb,
  p_iterator_id text default '',
  p_done boolean default false,
  p_abort boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  item jsonb;
  v_name text;
  v_list text;
  v_active boolean;
  v_started timestamptz;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if p_abort then
    update public.qbwc_sessions
    set vendor_sync = false, vendor_iterator_id = '', step = 'customer_query', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'aborted', true);
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_vendors, '[]'::jsonb))
  loop
    v_name := nullif(trim(coalesce(item->>'name', '')), '');
    if v_name is null then
      continue;
    end if;
    v_list := coalesce(nullif(trim(item->>'listId'), ''), '');
    v_active := coalesce((item->>'isActive')::boolean, true);
    if v_list = '' then
      continue;
    end if;
    insert into public.qb_vendors (company_id, list_id, name, is_active, synced_at)
    values (sess.company_id, v_list, v_name, v_active, now())
    on conflict (company_id, list_id)
    do update set name = excluded.name, is_active = excluded.is_active, synced_at = now();
  end loop;

  if p_done then
    v_started := coalesce(sess.vendor_sync_started_at, now() - interval '1 second');
    update public.qb_vendors
    set is_active = false
    where company_id = sess.company_id
      and synced_at < v_started;
    update public.qbwc_connectors
    set vendors_synced_at = now(), vendor_sync_requested = false, last_error = '', updated_at = now()
    where company_id = sess.company_id;
    update public.qbwc_sessions
    set vendor_sync = false, vendor_iterator_id = '', vendor_sync_started_at = null,
        step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket;
  else
    update public.qbwc_sessions
    set vendor_iterator_id = coalesce(p_iterator_id, ''),
        step = 'vendor_list_query',
        last_error = '',
        updated_at = now()
    where ticket = p_ticket;
  end if;

  return jsonb_build_object('ok', true, 'done', p_done);
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
  conn public.qbwc_connectors%rowtype;
  v_invoice uuid;
  v_expense uuid;
  v_payment uuid;
  v_payload jsonb;
  v_stale boolean;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if sess.vendor_sync
     and sess.invoice_id is null
     and sess.expense_id is null
     and sess.payment_id is null then
    return jsonb_build_object(
      'ok', true,
      'done', false,
      'ticket', sess.ticket,
      'step', 'vendor_list_query',
      'work', jsonb_build_object(
        'kind', 'vendor_sync',
        'iteratorId', coalesce(sess.vendor_iterator_id, '')
      )
    );
  end if;

  if sess.invoice_id is null and sess.expense_id is null and sess.payment_id is null then
    select * into conn from public.qbwc_connectors where company_id = sess.company_id;
    v_stale := conn.company_id is not null and (
      coalesce(conn.vendor_sync_requested, true)
      or conn.vendors_synced_at is null
      or conn.vendors_synced_at < now() - interval '20 hours'
    );
    if v_stale then
      update public.qbwc_sessions
      set vendor_sync = true, vendor_iterator_id = '', vendor_sync_started_at = now(),
          step = 'vendor_list_query', last_error = '',
          resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
          updated_at = now()
      where ticket = p_ticket
      returning * into sess;
      return jsonb_build_object(
        'ok', true,
        'done', false,
        'ticket', sess.ticket,
        'step', 'vendor_list_query',
        'work', jsonb_build_object('kind', 'vendor_sync', 'iteratorId', '')
      );
    end if;

    v_invoice := public.qbwc_pick_invoice(sess.company_id);
    if v_invoice is not null then
      update public.qbwc_sessions
      set invoice_id = v_invoice, expense_id = null, payment_id = null,
          step = 'customer_query', last_error = '',
          resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
          updated_at = now()
      where ticket = p_ticket
      returning * into sess;
    else
      v_expense := public.qbwc_pick_expense(sess.company_id);
      if v_expense is not null then
        update public.qbwc_sessions
        set expense_id = v_expense, invoice_id = null, payment_id = null,
            step = 'vendor_query', last_error = '',
            resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
            updated_at = now()
        where ticket = p_ticket
        returning * into sess;
      else
        v_payment := public.qbwc_pick_payment(sess.company_id);
        if v_payment is not null then
          update public.qbwc_sessions
          set payment_id = v_payment, invoice_id = null, expense_id = null,
              step = 'customer_query', last_error = '',
              resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
              updated_at = now()
          where ticket = p_ticket
          returning * into sess;
        else
          return jsonb_build_object('ok', true, 'done', true);
        end if;
      end if;
    end if;
  end if;

  if sess.invoice_id is not null then
    v_payload := public.qbwc_invoice_payload(sess.invoice_id);
  elsif sess.expense_id is not null then
    v_payload := public.qbwc_expense_payload(sess.expense_id);
  else
    v_payload := public.qbwc_payment_payload(sess.payment_id);
  end if;

  if v_payload is null then
    update public.qbwc_sessions
    set invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query',
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
        updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'done', true);
  end if;

  if coalesce(sess.resolved_customer, '') <> '' then
    v_payload := jsonb_set(v_payload, '{customerName}', to_jsonb(sess.resolved_customer));
  end if;
  if coalesce(sess.resolved_customer_list_id, '') <> '' then
    v_payload := v_payload || jsonb_build_object('customerListId', sess.resolved_customer_list_id);
  end if;
  if coalesce(sess.resolved_job_list_id, '') <> '' then
    v_payload := v_payload || jsonb_build_object('jobListId', sess.resolved_job_list_id);
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

revoke all on function public.qbwc_request_vendor_sync() from public;
grant execute on function public.qbwc_request_vendor_sync() to authenticated;
revoke all on function public.qbwc_save_vendors(uuid, jsonb, text, boolean, boolean) from public;
grant execute on function public.qbwc_save_vendors(uuid, jsonb, text, boolean, boolean) to anon, authenticated;
revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;
