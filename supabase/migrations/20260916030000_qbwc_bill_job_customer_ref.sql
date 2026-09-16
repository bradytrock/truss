-- Hang vendor bills on the CRM job (Customer:Job ListID). Re-queue bills that
-- already landed in A/P with no job so they can be voided and posted again.

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
    'replaceTxnId', v_replace,
    'replaceTxnKind', v_replace_kind
  );
end;
$$;
