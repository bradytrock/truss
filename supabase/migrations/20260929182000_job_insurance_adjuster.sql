-- The adjuster is typed onto the claim: name, email, and phone.
-- They are not a contact. Copy any adjuster already linked, then drop the contact.

alter table public.job_insurance
  add column if not exists adjuster_name text not null default '',
  add column if not exists adjuster_email text not null default '',
  add column if not exists adjuster_phone text not null default '';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_insurance'
      and column_name = 'adjuster_contact_id'
  ) then
    update public.job_insurance as claim
    set
      adjuster_name = coalesce(contact.name, ''),
      adjuster_email = coalesce(contact.email, ''),
      adjuster_phone = coalesce(contact.phone, '')
    from public.contacts as contact
    where claim.adjuster_contact_id = contact.id
      and claim.adjuster_name = '';

    alter table public.job_insurance drop column adjuster_contact_id;
  end if;
end $$;

notify pgrst, 'reload schema';
