-- CC addresses and extra people on a Gmail thread (homeowner + referral partner).
-- Safe to re-run.

alter table public.gmail_messages add column if not exists cc_email text;
alter table public.gmail_messages add column if not exists related_contact_ids uuid[];

update public.gmail_messages set cc_email = coalesce(cc_email, '') where cc_email is null;
update public.gmail_messages set related_contact_ids = coalesce(related_contact_ids, '{}') where related_contact_ids is null;

alter table public.gmail_messages alter column cc_email set default '';
alter table public.gmail_messages alter column cc_email set not null;
alter table public.gmail_messages alter column related_contact_ids set default '{}';
alter table public.gmail_messages alter column related_contact_ids set not null;

notify pgrst, 'reload schema';
