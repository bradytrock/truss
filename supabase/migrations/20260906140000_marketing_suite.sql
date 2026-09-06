-- Marketing Suite: templates stay in app code; materials/campaigns/assets/events persist per company.

create table if not exists public.marketing_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  template_id text not null,
  kind text not null,
  name text not null default '',
  status text not null default 'ready',
  headline text not null default '',
  subhead text not null default '',
  body text not null default '',
  cta text not null default '',
  badge text not null default '',
  accent text not null default '#b45309',
  job_id uuid,
  contact_id uuid,
  partner_contact_id uuid,
  photo_urls jsonb not null default '[]'::jsonb,
  share_token text not null,
  created_by_staff_id uuid,
  created_by_name text not null default '',
  vanity_slug text not null default '',
  views integer not null default 0,
  downloads integer not null default 0,
  shares integer not null default 0,
  ctas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_materials_share_token_key
  on public.marketing_materials (share_token);
create unique index if not exists marketing_materials_company_slug_key
  on public.marketing_materials (company_id, vanity_slug)
  where vanity_slug <> '';
create index if not exists marketing_materials_company_idx
  on public.marketing_materials (company_id, created_at desc);

alter table public.marketing_materials enable row level security;

drop policy if exists "company isolation" on public.marketing_materials;
create policy "company isolation" on public.marketing_materials
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  material_id uuid not null references public.marketing_materials (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_events_material_idx
  on public.marketing_events (material_id, created_at desc);

alter table public.marketing_events enable row level security;

drop policy if exists "company isolation" on public.marketing_events;
create policy "company isolation" on public.marketing_events
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  kind text not null default 'custom',
  summary text not null default '',
  neighborhood text not null default '',
  radius_miles numeric not null default 1,
  storm_name text not null default '',
  status text not null default 'draft',
  material_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_campaigns_company_idx
  on public.marketing_campaigns (company_id, created_at desc);

alter table public.marketing_campaigns enable row level security;

drop policy if exists "company isolation" on public.marketing_campaigns;
create policy "company isolation" on public.marketing_campaigns
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  source text not null,
  url text not null,
  notes text not null default '',
  job_id uuid,
  company_file_id uuid,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists marketing_assets_company_idx
  on public.marketing_assets (company_id, created_at desc);

alter table public.marketing_assets enable row level security;

drop policy if exists "company isolation" on public.marketing_assets;
create policy "company isolation" on public.marketing_assets
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Public read of a shared material by token (no auth).
create or replace function public.shared_marketing_material(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.marketing_materials%rowtype;
  company_name text;
begin
  select * into row
  from public.marketing_materials
  where share_token = p_token
  limit 1;
  if not found then
    return null;
  end if;
  select name into company_name from public.companies where id = row.company_id;
  return jsonb_build_object(
    'id', row.id,
    'name', row.name,
    'kind', row.kind,
    'headline', row.headline,
    'subhead', row.subhead,
    'body', row.body,
    'cta', row.cta,
    'badge', row.badge,
    'accent', row.accent,
    'photoUrls', coalesce(row.photo_urls, '[]'::jsonb),
    'companyName', coalesce(company_name, ''),
    'shareToken', row.share_token
  );
end;
$$;

revoke all on function public.shared_marketing_material(text) from public;
grant execute on function public.shared_marketing_material(text) to anon, authenticated;

create or replace function public.record_marketing_event(p_token text, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mat public.marketing_materials%rowtype;
begin
  if p_kind not in ('view', 'download', 'share', 'cta') then
    return;
  end if;
  select * into mat from public.marketing_materials where share_token = p_token limit 1;
  if not found then
    return;
  end if;
  insert into public.marketing_events (company_id, material_id, kind)
  values (mat.company_id, mat.id, p_kind);
  if p_kind = 'view' then
    update public.marketing_materials set views = views + 1, status = case when status = 'ready' then 'shared' else status end where id = mat.id;
  elsif p_kind = 'download' then
    update public.marketing_materials set downloads = downloads + 1 where id = mat.id;
  elsif p_kind = 'share' then
    update public.marketing_materials set shares = shares + 1, status = 'shared' where id = mat.id;
  else
    update public.marketing_materials set ctas = ctas + 1 where id = mat.id;
  end if;
end;
$$;

revoke all on function public.record_marketing_event(text, text) from public;
grant execute on function public.record_marketing_event(text, text) to anon, authenticated;
