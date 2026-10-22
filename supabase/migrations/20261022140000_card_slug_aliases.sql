-- Older digital-card URLs keep working when a seat's card link changes.
-- card_slug_aliases is a comma-separated list of previous first.last slugs.

alter table public.team_members
  add column if not exists card_slug_aliases text not null default '';

create or replace function public.resolve_card_alias(p_company text, p_person text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tm.card_slug
  from public.companies c
  join public.team_members tm on tm.company_id = c.id
  where lower(c.slug) = lower(btrim(p_company))
    and btrim(coalesce(tm.card_slug_aliases, '')) <> ''
    and exists (
      select 1
      from unnest(string_to_array(tm.card_slug_aliases, ',')) as alias
      where lower(btrim(alias)) = lower(btrim(p_person))
    )
  limit 1;
$$;

alter function public.resolve_card_alias(text, text) owner to postgres;
revoke all on function public.resolve_card_alias(text, text) from public;
grant execute on function public.resolve_card_alias(text, text) to anon, authenticated;
