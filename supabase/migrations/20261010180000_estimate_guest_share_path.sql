-- A homeowner who opens the office estimate URL (no CRM login) is sent to the
-- public proposal. Drafts stay on the office URL. The share token is already
-- what email and text send; this covers the address-bar link as well.

create or replace function public.estimate_guest_share_path(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '/share/e/' || e.share_token
  from public.estimates e
  where e.id = p_id
    and e.status <> 'draft'
    and length(coalesce(e.share_token, '')) >= 6
    and e.share_token ~ '^[A-Za-z0-9_-]+$'
  limit 1;
$$;

revoke all on function public.estimate_guest_share_path(uuid) from public;
grant execute on function public.estimate_guest_share_path(uuid) to anon, authenticated;
