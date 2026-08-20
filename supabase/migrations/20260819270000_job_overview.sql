-- Job overview: address, crew, tags, related people, and custom fields
-- so the job record can carry the field/production flow.

alter table public.jobs
  add column if not exists description text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists sales_rep text not null default '',
  add column if not exists assigned text[] not null default '{}',
  add column if not exists subcontractor_ids uuid[] not null default '{}',
  add column if not exists related_contact_ids uuid[] not null default '{}',
  add column if not exists custom_fields jsonb not null default '[]'::jsonb,
  add column if not exists project_type public.project_type,
  add column if not exists lead_source text not null default '';
