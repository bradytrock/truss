-- Google review listings as named offices. A company creates a location once,
-- then each seat is pointed at the office their reviews should land on.
-- Replaces the free-text review link that lived on companies and team_members.
-- Safe to re-run.

create table if not exists public.google_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  review_url text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists google_locations_company_id_idx
  on public.google_locations (company_id);

alter table public.google_locations enable row level security;

drop policy if exists "company isolation" on public.google_locations;
create policy "company isolation" on public.google_locations
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

alter table public.team_members
  add column if not exists google_location_id uuid
    references public.google_locations (id) on delete set null;

create index if not exists team_members_google_location_id_idx
  on public.team_members (google_location_id);

-- Carry the old links over so nobody loses a listing. The company link becomes
-- the default office; any seat link that differs becomes its own office and
-- keeps that seat pointed at it. Names are generic on purpose — rename them.
do $$
declare
  c record;
  s record;
  v_location uuid;
  v_seq integer;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'google_review_url'
  ) then
    return;
  end if;

  for c in select id, name, coalesce(google_review_url, '') as url from public.companies loop
    v_location := null;

    if nullif(trim(c.url), '') is not null then
      select id into v_location
      from public.google_locations
      where company_id = c.id and review_url = trim(c.url)
      limit 1;

      if v_location is null then
        insert into public.google_locations (company_id, name, review_url, is_default)
        values (c.id, 'Main office', trim(c.url), true)
        returning id into v_location;
      end if;
    end if;

    for s in
      select id, coalesce(google_review_url, '') as url
      from public.team_members
      where company_id = c.id
        and nullif(trim(coalesce(google_review_url, '')), '') is not null
        and google_location_id is null
    loop
      declare
        v_seat_location uuid;
      begin
        select id into v_seat_location
        from public.google_locations
        where company_id = c.id and review_url = trim(s.url)
        limit 1;

        if v_seat_location is null then
          select count(*) into v_seq from public.google_locations where company_id = c.id;
          insert into public.google_locations (company_id, name, review_url, is_default)
          values (
            c.id,
            case when v_seq = 0 then 'Main office' else 'Office ' || (v_seq + 1)::text end,
            trim(s.url),
            v_seq = 0
          )
          returning id into v_seat_location;
        end if;

        update public.team_members
        set google_location_id = v_seat_location
        where id = s.id;
      end;
    end loop;
  end loop;
end $$;

-- A company with exactly one listing should have it as the default.
update public.google_locations l
set is_default = true
where not l.is_default
  and not exists (
    select 1 from public.google_locations d
    where d.company_id = l.company_id and d.is_default
  )
  and l.id = (
    select x.id from public.google_locations x
    where x.company_id = l.company_id
    order by x.created_at, x.id
    limit 1
  );

-- Exactly one default per company.
create unique index if not exists google_locations_one_default_uidx
  on public.google_locations (company_id)
  where is_default;

alter table public.google_locations replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.google_locations;
exception
  when duplicate_object then null;
end $$;

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
  v_company_json jsonb;
  v_default_review text := '';
  v_review text := '';
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

  select coalesce(review_url, '') into v_default_review
  from public.google_locations
  where company_id = v_company.id and is_default
  limit 1;
  v_default_review := coalesce(v_default_review, '');

  v_company_json := jsonb_build_object(
    'name', v_company.name,
    'phone', coalesce(v_company.phone, ''),
    'email', coalesce(v_company.email, ''),
    'website', coalesce(v_company.website, ''),
    'street', coalesce(v_company.street, ''),
    'city', coalesce(v_company.city, ''),
    'state', coalesce(v_company.state, ''),
    'postalCode', coalesce(v_company.postal_code, ''),
    'logoUrl', coalesce(v_company.logo_url, ''),
    'cardLogoUrl', coalesce(v_company.card_logo_url, ''),
    'googleReviewUrl', v_default_review,
    'paymentVenmo', coalesce(v_company.payment_venmo, ''),
    'paymentZelle', coalesce(v_company.payment_zelle, ''),
    'paymentCashapp', coalesce(v_company.payment_cashapp, ''),
    'paymentPaypal', coalesce(v_company.payment_paypal, ''),
    'paymentNote', coalesce(v_company.payment_note, ''),
    'slug', v_company.slug
  );

  select * into v_staff
  from public.team_members
  where company_id = v_company.id
    and lower(card_slug) = v_person_slug
  limit 1;

  if not found or coalesce(v_staff.locked, false) then
    return jsonb_build_object(
      'available', false,
      'company', v_company_json,
      'person', null
    );
  end if;

  if v_staff.google_location_id is not null then
    select coalesce(review_url, '') into v_review
    from public.google_locations
    where id = v_staff.google_location_id
    limit 1;
  end if;
  v_review := coalesce(nullif(trim(coalesce(v_review, '')), ''), v_default_review);

  return jsonb_build_object(
    'available', true,
    'company', v_company_json,
    'person', jsonb_build_object(
      'name', v_staff.name,
      'title', coalesce(v_staff.title, ''),
      'initials', coalesce(
        nullif(v_staff.initials, ''),
        upper(left(v_staff.name, 2))
      ),
      'email', coalesce(v_staff.email, ''),
      'phone', coalesce(v_staff.phone, ''),
      'photoUrl', coalesce(v_staff.photo_url, ''),
      'googleReviewUrl', v_review,
      'cardSlug', v_staff.card_slug
    )
  );
end;
$$;

alter function public.shared_card(text, text) owner to postgres;
revoke all on function public.shared_card(text, text) from public;
grant execute on function public.shared_card(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
