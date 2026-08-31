-- Public digital business cards at /{company}/card/{first.last}.
-- Company slug is unique across Truss. Person card_slug is unique per company
-- and stays put when they rename so NFC / QR keep working.

alter table public.companies
  add column if not exists slug text not null default '';

alter table public.team_members
  add column if not exists card_slug text not null default '';

create or replace function public.normalize_company_slug(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := lower(trim(coalesce(p_raw, '')));
  s := replace(s, '.', '-');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  s := left(s, 48);
  if s = '' then
    return 'company';
  end if;
  return s;
end;
$$;

create or replace function public.normalize_person_card_slug(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := lower(trim(coalesce(p_raw, '')));
  s := regexp_replace(s, '[^a-z0-9.]+', '-', 'g');
  s := regexp_replace(s, '[.]+', '.', 'g');
  s := regexp_replace(s, '[-]+', '-', 'g');
  s := regexp_replace(s, '^[.-]+|[.-]+$', '', 'g');
  s := left(s, 64);
  if s = '' then
    return 'card';
  end if;
  return s;
end;
$$;

create or replace function public.person_card_slug_from_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  first_name text;
  last_name text;
  first_slug text;
  last_slug text;
begin
  cleaned := lower(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
  first_name := split_part(cleaned, ' ', 1);
  last_name := regexp_replace(cleaned, '^.* ', '');
  first_slug := regexp_replace(first_name, '[^a-z0-9]+', '', 'g');
  last_slug := regexp_replace(last_name, '[^a-z0-9]+', '', 'g');
  if first_slug = '' and last_slug = '' then
    return 'card';
  end if;
  if last_slug = '' or last_slug = first_slug then
    return left(first_slug, 64);
  end if;
  return left(first_slug || '.' || last_slug, 64);
end;
$$;

create or replace function public.company_slug_is_reserved(p_slug text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_slug, ''))) in (
    'accounting','admin','api','app','approve','auth','billing','calendar','card',
    'catalog','clients','contacts','documents','estimates','favicon.ico','help',
    'home','invoices','jobs','login','mail','material-orders','messages',
    'opportunities','people','photos','pipeline','price-book','profile','qbwc',
    'quickbooks','reports','robots','schedule','settings','share','signup',
    'sitemap','status','support','teams','training','webhook','webhooks','www',
    '_next'
  );
$$;

create or replace function public.next_company_slug(p_desired text, p_exclude uuid default null)
returns text
language plpgsql
stable
as $$
declare
  base text;
  candidate text;
  n integer := 2;
begin
  base := public.normalize_company_slug(p_desired);
  if public.company_slug_is_reserved(base) then
    base := left(base || '-co', 48);
  end if;
  if public.company_slug_is_reserved(base) then
    base := 'company';
  end if;
  candidate := base;
  loop
    if not exists (
      select 1
      from public.companies c
      where lower(c.slug) = candidate
        and (p_exclude is null or c.id is distinct from p_exclude)
    ) then
      return candidate;
    end if;
    candidate := left(base, 40) || '-' || n::text;
    n := n + 1;
  end loop;
end;
$$;

create or replace function public.next_person_card_slug(
  p_company uuid,
  p_desired text,
  p_exclude uuid default null
)
returns text
language plpgsql
stable
as $$
declare
  base text;
  candidate text;
  n integer := 2;
begin
  base := public.normalize_person_card_slug(p_desired);
  candidate := base;
  loop
    if not exists (
      select 1
      from public.team_members tm
      where tm.company_id = p_company
        and lower(tm.card_slug) = candidate
        and (p_exclude is null or tm.id is distinct from p_exclude)
    ) then
      return candidate;
    end if;
    candidate := left(base, 56) || '-' || n::text;
    n := n + 1;
  end loop;
end;
$$;

create or replace function public.companies_mint_slug()
returns trigger
language plpgsql
as $$
declare
  desired text;
begin
  desired := nullif(trim(coalesce(new.slug, '')), '');
  if desired is null then
    new.slug := public.next_company_slug(new.name, new.id);
    return new;
  end if;
  new.slug := public.normalize_company_slug(desired);
  if public.company_slug_is_reserved(new.slug) then
    raise exception 'Company slug is reserved'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_mint_slug on public.companies;
create trigger companies_mint_slug
  before insert or update on public.companies
  for each row execute function public.companies_mint_slug();

create or replace function public.team_members_mint_card_slug()
returns trigger
language plpgsql
as $$
declare
  desired text;
begin
  desired := nullif(trim(coalesce(new.card_slug, '')), '');
  if desired is null then
    new.card_slug := public.next_person_card_slug(
      new.company_id,
      public.person_card_slug_from_name(new.name),
      new.id
    );
    return new;
  end if;
  new.card_slug := public.normalize_person_card_slug(desired);
  return new;
end;
$$;

drop trigger if exists team_members_mint_card_slug on public.team_members;
create trigger team_members_mint_card_slug
  before insert or update on public.team_members
  for each row execute function public.team_members_mint_card_slug();

do $$
declare
  r record;
begin
  for r in
    select id, name
    from public.companies
    where nullif(trim(slug), '') is null
    order by created_at, id
  loop
    update public.companies
    set slug = public.next_company_slug(r.name, r.id)
    where id = r.id;
  end loop;

  for r in
    select id, company_id, name
    from public.team_members
    where nullif(trim(card_slug), '') is null
    order by created_at, id
  loop
    update public.team_members
    set card_slug = public.next_person_card_slug(
      r.company_id,
      public.person_card_slug_from_name(r.name),
      r.id
    )
    where id = r.id;
  end loop;
end $$;

create unique index if not exists companies_slug_uidx
  on public.companies (lower(slug))
  where slug <> '';

create unique index if not exists team_members_card_slug_uidx
  on public.team_members (company_id, lower(card_slug))
  where card_slug <> '';

create or replace function public.shared_card(p_company text, p_person text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_staff public.team_members%rowtype;
  v_company_slug text;
  v_person_slug text;
begin
  v_company_slug := lower(trim(coalesce(p_company, '')));
  v_person_slug := lower(trim(coalesce(p_person, '')));
  if v_company_slug = '' or v_person_slug = '' then
    return null;
  end if;

  select * into v_company
  from public.companies
  where lower(slug) = v_company_slug
  limit 1;
  if not found then
    return null;
  end if;

  select * into v_staff
  from public.team_members
  where company_id = v_company.id
    and lower(card_slug) = v_person_slug
  limit 1;

  if not found or coalesce(v_staff.locked, false) then
    return jsonb_build_object(
      'available', false,
      'company', jsonb_build_object(
        'name', v_company.name,
        'phone', coalesce(v_company.phone, ''),
        'email', coalesce(v_company.email, ''),
        'website', coalesce(v_company.website, ''),
        'street', coalesce(v_company.street, ''),
        'city', coalesce(v_company.city, ''),
        'state', coalesce(v_company.state, ''),
        'postalCode', coalesce(v_company.postal_code, ''),
        'logoUrl', coalesce(v_company.logo_url, ''),
        'slug', v_company.slug
      ),
      'person', null
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'company', jsonb_build_object(
      'name', v_company.name,
      'phone', coalesce(v_company.phone, ''),
      'email', coalesce(v_company.email, ''),
      'website', coalesce(v_company.website, ''),
      'street', coalesce(v_company.street, ''),
      'city', coalesce(v_company.city, ''),
      'state', coalesce(v_company.state, ''),
      'postalCode', coalesce(v_company.postal_code, ''),
      'logoUrl', coalesce(v_company.logo_url, ''),
      'slug', v_company.slug
    ),
    'person', jsonb_build_object(
      'name', v_staff.name,
      'title', coalesce(v_staff.title, ''),
      'initials', coalesce(
        nullif(v_staff.initials, ''),
        upper(left(v_staff.name, 2))
      ),
      'email', coalesce(v_staff.email, ''),
      'phone', coalesce(v_staff.phone, ''),
      'cardSlug', v_staff.card_slug
    )
  );
end;
$$;

alter function public.shared_card(text, text) owner to postgres;
revoke all on function public.shared_card(text, text) from public;
grant execute on function public.shared_card(text, text) to anon, authenticated;

revoke all on function public.normalize_company_slug(text) from public, anon, authenticated;
revoke all on function public.normalize_person_card_slug(text) from public, anon, authenticated;
revoke all on function public.person_card_slug_from_name(text) from public, anon, authenticated;
revoke all on function public.company_slug_is_reserved(text) from public, anon, authenticated;
revoke all on function public.next_company_slug(text, uuid) from public, anon, authenticated;
revoke all on function public.next_person_card_slug(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.companies_mint_slug() from public, anon, authenticated;
revoke all on function public.team_members_mint_card_slug() from public, anon, authenticated;

notify pgrst, 'reload schema';
