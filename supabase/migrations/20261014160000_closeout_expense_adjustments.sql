-- Accounting can reclassify a closeout expense as a project-manager deduction
-- or a customer refund without rewriting the QuickBooks bill.

alter table public.commission_closeouts
  add column if not exists expense_adjustments jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
