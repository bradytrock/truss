-- Job expenses are vendor bills on Customer:Job, posted to the numbered chart
-- accounts (Construction Materials Costs, Subcontractors Expense, …). They must
-- not land on stray expense accounts such as "Job materials" or "Subcontractors".
--
-- Account names stay in sync with src/lib/qbwc/accounts.ts.

alter table public.qbwc_sessions
  add column if not exists resolved_account_list_id text not null default '';

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
          resolved_account_list_id = '',
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
          resolved_account_list_id = '',
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
            resolved_account_list_id = '',
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
              resolved_account_list_id = '',
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
        resolved_account_list_id = '',
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
  if coalesce(sess.resolved_account_list_id, '') <> '' then
    v_payload := v_payload || jsonb_build_object('accountListId', sess.resolved_account_list_id);
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

drop function if exists public.qbwc_apply_response(uuid, text, text, text, text);
drop function if exists public.qbwc_apply_response(uuid, text, text, text, text, text, text, text);

create or replace function public.qbwc_apply_response(
  p_ticket uuid,
  p_action text,
  p_next_step text default '',
  p_txn_id text default '',
  p_error text default '',
  p_customer_name text default '',
  p_customer_list_id text default '',
  p_job_list_id text default '',
  p_account_list_id text default ''
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
        resolved_account_list_id = case
          when coalesce(p_account_list_id, '') <> '' then p_account_list_id
          else resolved_account_list_id
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
        resolved_account_list_id = '',
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
      update public.expenses
      set qb_status = case
            when coalesce(p_txn_id, '') <> '' then 'queued'
            else 'error'
          end,
          qb_txn_id = case
            when coalesce(p_txn_id, '') <> '' then p_txn_id
            else qb_txn_id
          end,
          qb_txn_kind = case
            when coalesce(p_txn_id, '') <> '' then
              case when method = 'credit_card' then 'credit_card' else 'bill' end
            else qb_txn_kind
          end
      where id = sess.expense_id;
    end if;
    if sess.payment_id is not null then
      update public.payments set qb_status = 'error' where id = sess.payment_id;
    end if;
    update public.qbwc_sessions
    set last_error = coalesce(p_error, 'QuickBooks rejected the request'),
        invoice_id = null, expense_id = null, payment_id = null,
        step = 'customer_query',
        resolved_customer = '', resolved_customer_list_id = '', resolved_job_list_id = '',
        resolved_account_list_id = '',
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

revoke all on function public.qbwc_apply_response(uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.qbwc_apply_response(uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Job bills already in A/P were filed on a chart account without Customer:Job.
-- Queue them so the connector voids the bill and posts it on the job.
update public.expenses
set qb_status = 'queued'
where job_id is not null
  and method is distinct from 'credit_card'
  and qb_status = 'entered'
  and coalesce(qb_txn_id, '') <> '';

notify pgrst, 'reload schema';
