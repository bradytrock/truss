-- Job costs post as vendor bills on Customer:Job.
-- ACH/debit/cash that already went in as checks are re-queued so the
-- connector can void those checks and add bills on the same job.

alter table public.expenses
  add column if not exists qb_txn_kind text not null default '';

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
  v_has_job boolean;
  v_job_code text;
  v_replace text;
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
  v_pay := case
    when exp.method = 'credit_card' then 'credit_card'
    when v_has_job then 'bill'
    when exp.method = 'check' then 'check'
    else 'bill'
  end;
  v_pay_account := case
    when v_pay = 'credit_card' then coalesce(nullif(trim(conn.cc_account_name), ''), 'Credit Card')
    when v_pay = 'bill' then 'Accounts Payable'
    else coalesce(nullif(trim(conn.bank_account_name), ''), 'Checking')
  end;
  v_replace := case
    when v_pay = 'bill'
      and coalesce(exp.qb_txn_kind, '') in ('', 'check')
      and coalesce(exp.qb_txn_id, '') <> ''
    then exp.qb_txn_id
    else ''
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
    'vendor', exp.vendor,
    'accountName', v_account,
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
    'replaceTxnId', v_replace
  );
end;
$$;

create or replace function public.qbwc_apply_response(
  p_ticket uuid,
  p_action text,
  p_next_step text default '',
  p_txn_id text default '',
  p_error text default '',
  p_customer_name text default '',
  p_customer_list_id text default '',
  p_job_list_id text default ''
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
    set step = p_next_step,
        last_error = '',
        resolved_customer = case
          when coalesce(p_customer_name, '') <> '' then p_customer_name
          else resolved_customer
        end,
        resolved_customer_list_id = case
          when coalesce(p_customer_list_id, '') <> '' then p_customer_list_id
          else resolved_customer_list_id
        end,
        resolved_job_list_id = case
          when coalesce(p_job_list_id, '') <> '' then p_job_list_id
          else resolved_job_list_id
        end,
        updated_at = now()
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
      set qb_status = 'entered',
          qb_txn_id = coalesce(p_txn_id, ''),
          qb_txn_kind = case
            when method = 'credit_card' then 'credit_card'
            when job_id is not null then 'bill'
            when method = 'check' then 'check'
            else 'bill'
          end
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
        step = 'customer_query', last_error = '',
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
        updated_at = now()
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
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
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

update public.expenses
set qb_status = 'queued',
    qb_txn_kind = 'check'
where job_id is not null
  and method not in ('credit_card', 'check')
  and qb_status = 'entered'
  and coalesce(qb_txn_id, '') <> '';
