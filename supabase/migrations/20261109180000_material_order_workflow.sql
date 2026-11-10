-- Delivery window, supplier account, and send status for material orders.

alter table public.material_orders
  add column if not exists status text not null default 'draft',
  add column if not exists fulfillment text not null default 'delivery',
  add column if not exists delivery_window text not null default 'morning',
  add column if not exists on_calendar boolean not null default true,
  add column if not exists quick_notes text not null default '',
  add column if not exists sent_at timestamptz,
  add column if not exists branch text not null default '',
  add column if not exists account_number text not null default '';

notify pgrst, 'reload schema';
