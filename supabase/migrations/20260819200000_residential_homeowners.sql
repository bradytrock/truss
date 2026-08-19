-- Homeowners do not need a company. Residential project types and claim/T&M delivery.

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

alter table public.contacts
  alter column client_id drop not null;

alter table public.contacts
  drop constraint if exists contacts_client_id_fkey;

alter table public.contacts
  add constraint contacts_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

alter table public.opportunities
  alter column client_id drop not null;

alter table public.jobs
  alter column client_id drop not null;

alter table public.jobs
  add column if not exists primary_contact_id uuid references public.contacts (id) on delete set null;

create index if not exists jobs_primary_contact_id_idx on public.jobs (primary_contact_id);

alter table public.estimates
  alter column client_id drop not null;

alter table public.invoices
  alter column client_id drop not null;
