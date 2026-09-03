-- Social pages on the digital business card. The website already lives on
-- companies.website; these are the profiles a homeowner might follow.
-- Safe to re-run.

alter table public.companies
  add column if not exists social_facebook text not null default '',
  add column if not exists social_instagram text not null default '',
  add column if not exists social_youtube text not null default '',
  add column if not exists social_linkedin text not null default '',
  add column if not exists social_tiktok text not null default '';

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
    'socialFacebook', coalesce(v_company.social_facebook, ''),
    'socialInstagram', coalesce(v_company.social_instagram, ''),
    'socialYoutube', coalesce(v_company.social_youtube, ''),
    'socialLinkedin', coalesce(v_company.social_linkedin, ''),
    'socialTiktok', coalesce(v_company.social_tiktok, ''),
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
