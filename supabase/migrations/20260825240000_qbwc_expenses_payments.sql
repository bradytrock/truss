-- Web Connector: queue expenses (check / credit card charge) and payments
-- (receive payment against the QuickBooks invoice TxnID).

alter table public.qbwc_connectors
  add column if not exists bank_account_name text not null default 'Checking';

alter table public.qbwc_connectors
  add column if not exists cc_account_name text not null default 'Credit Card';

alter table public.qbwc_sessions
  add column if not exists expense_id uuid references public.expenses (id) on delete set null;

alter table public.qbwc_sessions
  add column if not exists payment_id uuid references public.payments (id) on delete set null;

alter table public.expenses
  add column if not exists qb_txn_id text not null default '';

alter table public.payments
  add column if not exists qb_txn_id text not null default '';

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

create or replace function public.qbwc_pick_expense(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select exp.id into v_id
  from public.expenses exp
  where exp.company_id = p_company
    and exp.qb_status = 'queued'
    and exp.amount > 0
    and coalesce(trim(exp.vendor), '') <> ''
  order by exp.incurred_at, exp.number
  limit 1;
  return v_id;
end;
$$;

create or replace function public.qbwc_pick_payment(p_company uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select pay.id into v_id
  from public.payments pay
  left join public.invoices inv on inv.id = pay.invoice_id
  where pay.company_id = p_company
    and pay.qb_status = 'queued'
    and pay.amount > 0
    and (
      (
        pay.invoice_id is not null
        and inv.qb_status = 'entered'
        and coalesce(inv.qb_txn_id, '') <> ''
      )
      or (pay.invoice_id is null and pay.job_id is not null)
    )
  order by pay.paid_at, pay.id
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
    'kind', 'invoice',
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
  v_pay text;
  v_pay_account text;
begin
  select * into exp from public.expenses where id = p_expense;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = exp.job_id;
  select * into company from public.companies where id = exp.company_id;
  select * into conn from public.qbwc_connectors where company_id = exp.company_id;

  v_account := case exp.account
    when 'materials' then 'Job materials'
    when 'subcontractors' then 'Subcontractors'
    when 'equipment_rental' then 'Equipment rental'
    when 'dumpsters' then 'Dumpsters / disposal'
    when 'permits' then 'Permits & fees'
    when 'labor' then 'Direct labor'
    when 'fuel' then 'Fuel'
    when 'office' then 'Office / overhead'
    when 'insurance' then 'Insurance'
    else 'Other'
  end;
  v_pay := case when exp.method = 'credit_card' then 'credit_card' else 'check' end;
  v_pay_account := case
    when v_pay = 'credit_card' then coalesce(nullif(trim(conn.cc_account_name), ''), 'Credit Card')
    else coalesce(nullif(trim(conn.bank_account_name), ''), 'Checking')
  end;

  v_customer := coalesce(
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
  v_phone := coalesce(
    (select phone from public.contacts where id = job.primary_contact_id),
    company.phone,
    ''
  );

  return jsonb_build_object(
    'kind', 'expense',
    'expenseId', exp.id,
    'number', exp.number,
    'vendor', exp.vendor,
    'accountName', v_account,
    'amount', exp.amount,
    'payWith', v_pay,
    'txnDate', exp.incurred_at,
    'memo', coalesce(exp.memo, ''),
    'payAccount', v_pay_account,
    'customerName', v_customer,
    'jobCode', coalesce(job.code, ''),
    'jobName', coalesce(job.name, ''),
    'street', coalesce(job.street, ''),
    'city', coalesce(job.city, ''),
    'state', coalesce(job.state, ''),
    'postalCode', coalesce(job.postal_code, ''),
    'phone', coalesce(v_phone, ''),
    'hasJob', job.id is not null
  );
end;
$$;

create or replace function public.qbwc_payment_payload(p_payment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
  inv public.invoices%rowtype;
  job public.jobs%rowtype;
  conn public.qbwc_connectors%rowtype;
  v_customer text;
  v_job uuid;
begin
  select * into pay from public.payments where id = p_payment;
  if not found then
    return null;
  end if;
  if pay.invoice_id is not null then
    select * into inv from public.invoices where id = pay.invoice_id;
  end if;
  v_job := coalesce(pay.job_id, inv.job_id);
  select * into job from public.jobs where id = v_job;
  select * into conn from public.qbwc_connectors where company_id = pay.company_id;

  v_customer := coalesce(
    (select name from public.clients where id = inv.client_id),
    (select name from public.contacts where id = job.primary_contact_id),
    (select c.name
       from public.opportunities o
       join public.contacts c on c.id = o.primary_contact_id
      where o.id = job.opportunity_id),
    'Homeowner'
  );

  return jsonb_build_object(
    'kind', 'payment',
    'paymentId', pay.id,
    'amount', pay.amount,
    'txnDate', pay.paid_at,
    'reference', coalesce(pay.reference, ''),
    'memo', coalesce(inv.number, pay.reference, ''),
    'customerName', v_customer,
    'jobCode', coalesce(job.code, ''),
    'jobName', coalesce(job.name, ''),
    'invoiceNumber', coalesce(inv.number, ''),
    'invoiceTxnId', coalesce(inv.qb_txn_id, ''),
    'depositAccount', coalesce(nullif(trim(conn.bank_account_name), ''), 'Checking'),
    'hasJob', job.id is not null
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
  v_expense uuid;
  v_payment uuid;
  v_payload jsonb;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if sess.invoice_id is null and sess.expense_id is null and sess.payment_id is null then
    v_invoice := public.qbwc_pick_invoice(sess.company_id);
    if v_invoice is not null then
      update public.qbwc_sessions
      set invoice_id = v_invoice, expense_id = null, payment_id = null,
          step = 'customer_query', last_error = '', updated_at = now()
      where ticket = p_ticket
      returning * into sess;
    else
      v_expense := public.qbwc_pick_expense(sess.company_id);
      if v_expense is not null then
        update public.qbwc_sessions
        set expense_id = v_expense, invoice_id = null, payment_id = null,
            step = 'vendor_query', last_error = '', updated_at = now()
        where ticket = p_ticket
        returning * into sess;
      else
        v_payment := public.qbwc_pick_payment(sess.company_id);
        if v_payment is not null then
          update public.qbwc_sessions
          set payment_id = v_payment, invoice_id = null, expense_id = null,
              step = 'customer_query', last_error = '', updated_at = now()
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
        step = 'customer_query', updated_at = now()
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

  if p_action = 'complete' then
    if sess.invoice_id is not null then
      update public.invoices
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.invoice_id;
    elsif sess.expense_id is not null then
      update public.expenses
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.expense_id;
    elsif sess.payment_id is not null then
      update public.payments
      set qb_status = 'entered', qb_txn_id = coalesce(p_txn_id, '')
      where id = sess.payment_id;
    else
      return jsonb_build_object('ok', false, 'reason', 'action');
    end if;
    update public.qbwc_sessions
    set invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = '', updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'fail' then
    if sess.invoice_id is not null then
      update public.invoices set qb_status = 'error' where id = sess.invoice_id;
    end if;
    if sess.expense_id is not null then
      update public.expenses set qb_status = 'error' where id = sess.expense_id;
    end if;
    if sess.payment_id is not null then
      update public.payments set qb_status = 'error' where id = sess.payment_id;
    end if;
    update public.qbwc_sessions
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'),
        invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query',
        updated_at = now()
    where ticket = p_ticket;
    update public.qbwc_connectors
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'), updated_at = now()
    where company_id = sess.company_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'action');
end;
$$;

revoke all on function public.qbwc_pick_expense(uuid) from public;
revoke all on function public.qbwc_pick_payment(uuid) from public;
revoke all on function public.qbwc_expense_payload(uuid) from public;
revoke all on function public.qbwc_payment_payload(uuid) from public;
revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;
revoke all on function public.qbwc_apply_response(uuid, text, text, text, text) from public;
grant execute on function public.qbwc_apply_response(uuid, text, text, text, text) to anon, authenticated;
