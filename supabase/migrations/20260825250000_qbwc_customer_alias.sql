-- When the homeowner/client name already exists as a Vendor (or Other Name),
-- CustomerAdd cannot reuse it. Remember the customer ListID / an aliased
-- customer name on the session so the job hangs under a real Customer.

alter table public.qbwc_sessions
  add column if not exists resolved_customer text not null default '';

alter table public.qbwc_sessions
  add column if not exists resolved_customer_list_id text not null default '';

alter table public.qbwc_sessions
  add column if not exists resolved_job_list_id text not null default '';

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

drop function if exists public.qbwc_apply_response(uuid, text, text, text, text);

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

revoke all on function public.qbwc_next_work(uuid) from public;
grant execute on function public.qbwc_next_work(uuid) to anon, authenticated;
revoke all on function public.qbwc_apply_response(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.qbwc_apply_response(uuid, text, text, text, text, text, text, text) to anon, authenticated;
