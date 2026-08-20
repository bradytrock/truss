-- Homeowners, trades, and DTC jobs do not need a company on file.
-- Repeats 20260819200000 so a project that never ran that file can still seed.

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

alter table public.estimates
  alter column client_id drop not null;

alter table public.invoices
  alter column client_id drop not null;
