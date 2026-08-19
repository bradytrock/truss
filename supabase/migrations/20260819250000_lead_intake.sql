-- Lead intake: source, referred-by contact, and job-site address on pursuits.

alter table public.opportunities
  add column if not exists lead_source text not null default '',
  add column if not exists referral_contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists street text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists notes text not null default '';

create index if not exists opportunities_referral_contact_idx
  on public.opportunities (referral_contact_id)
  where referral_contact_id is not null;
