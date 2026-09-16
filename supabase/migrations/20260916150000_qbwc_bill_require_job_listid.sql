-- Job expenses cannot finish as company A/P. If BillAdd saved a TxnID without
-- Customer:Job, keep that TxnID so the next connector run can void it and
-- post the bill on the job ListID. Re-queue leftover entered job bills.

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

-- Leftover job bills in A/P may have no Customer:Job line. Queue them so the
-- connector voids the unattached bill and posts it on the job ListID.
update public.expenses
set qb_status = 'queued'
where job_id is not null
  and method is distinct from 'credit_card'
  and qb_status = 'entered'
  and coalesce(qb_txn_id, '') <> ''
  and coalesce(qb_txn_kind, '') in ('', 'bill', 'check');
