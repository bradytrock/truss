-- Ensure residential delivery, project, and client enum values exist.
-- Safe to re-run. The original 20260819200000 file already adds these; this
-- covers projects that applied later migrations without that one.

alter type public.project_type add value if not exists 'restoration';
alter type public.project_type add value if not exists 'remodel';
alter type public.project_type add value if not exists 'roofing';
alter type public.project_type add value if not exists 'exterior';
alter type public.project_type add value if not exists 'addition';

alter type public.delivery_method add value if not exists 'insurance_claim';
alter type public.delivery_method add value if not exists 'fixed_price';
alter type public.delivery_method add value if not exists 'time_and_materials';

alter type public.client_type add value if not exists 'insurance';
alter type public.client_type add value if not exists 'realtor';
alter type public.client_type add value if not exists 'trade_partner';
