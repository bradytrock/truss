-- Named proposal contracts at the company, plus which contract an estimate uses.

alter table public.companies
  add column if not exists contract_types jsonb not null default '[]'::jsonb;

alter table public.estimates
  add column if not exists contract_type_id text;

-- Seed a Standard contract from existing default terms when the company has none yet.
update public.companies
set contract_types = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', 'Standard',
    'body', coalesce(nullif(trim(default_estimate_terms), ''), ''),
    'isDefault', true
  )
)
where coalesce(contract_types, '[]'::jsonb) = '[]'::jsonb
  and coalesce(trim(default_estimate_terms), '') <> '';
