-- Web Connector only posts invoices that accounting pushed onto the queue.
-- qb_status = 'queued' (not every unentered invoice).

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
