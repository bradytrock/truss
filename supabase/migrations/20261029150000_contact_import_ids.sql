-- HubSpot contacts import.
--
-- 20261029120000_crm_import.sql gave contacts imported_at and external_source.
-- Importing a HubSpot Contacts export also needs the other CRM's Record ID on
-- the contact, so uploading the same export twice updates each person instead
-- of adding them again.

alter table public.contacts
  add column if not exists external_id text;

create unique index if not exists contacts_external_id_key
  on public.contacts (company_id, external_source, external_id)
  where external_source is not null and external_id is not null;

notify pgrst, 'reload schema';
