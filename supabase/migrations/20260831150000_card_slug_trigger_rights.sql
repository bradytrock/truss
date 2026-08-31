-- Seat inserts (People → Add, signup) fire team_members_mint_card_slug as the
-- current role. The helpers were revoked from authenticated so the trigger
-- could not mint a card URL: permission denied for function normalize_person_card_slug.
-- Run the mint triggers as postgres and grant the helpers to auth admin.

alter function public.companies_mint_slug() security definer;
alter function public.companies_mint_slug() set search_path = public;
alter function public.team_members_mint_card_slug() security definer;
alter function public.team_members_mint_card_slug() set search_path = public;

alter function public.next_company_slug(text, uuid) security definer;
alter function public.next_company_slug(text, uuid) set search_path = public;
alter function public.next_person_card_slug(uuid, text, uuid) security definer;
alter function public.next_person_card_slug(uuid, text, uuid) set search_path = public;

alter function public.companies_mint_slug() owner to postgres;
alter function public.team_members_mint_card_slug() owner to postgres;
alter function public.next_company_slug(text, uuid) owner to postgres;
alter function public.next_person_card_slug(uuid, text, uuid) owner to postgres;

grant execute on function public.normalize_company_slug(text) to postgres, authenticated;
grant execute on function public.normalize_person_card_slug(text) to postgres, authenticated;
grant execute on function public.person_card_slug_from_name(text) to postgres, authenticated;
grant execute on function public.company_slug_is_reserved(text) to postgres, authenticated;
grant execute on function public.next_company_slug(text, uuid) to postgres, authenticated;
grant execute on function public.next_person_card_slug(uuid, text, uuid) to postgres, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.normalize_company_slug(text) to supabase_auth_admin;
    grant execute on function public.normalize_person_card_slug(text) to supabase_auth_admin;
    grant execute on function public.person_card_slug_from_name(text) to supabase_auth_admin;
    grant execute on function public.company_slug_is_reserved(text) to supabase_auth_admin;
    grant execute on function public.next_company_slug(text, uuid) to supabase_auth_admin;
    grant execute on function public.next_person_card_slug(uuid, text, uuid) to supabase_auth_admin;
    grant execute on function public.companies_mint_slug() to supabase_auth_admin;
    grant execute on function public.team_members_mint_card_slug() to supabase_auth_admin;
  end if;
end $$;

notify pgrst, 'reload schema';
