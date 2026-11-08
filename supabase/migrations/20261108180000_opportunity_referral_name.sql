-- A referral seed can name a person or group that is not a contact.

alter table public.opportunities
  add column if not exists referral_name text not null default '';
