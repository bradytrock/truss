-- CompanyCam at the company level: each office stores its own access token,
-- links a job to one CompanyCam project, and copies photo URLs onto the job.
-- Safe to re-run.

create table if not exists public.companycam_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  access_token text not null default '',
  token_hint text not null default '',
  companycam_company_id text not null default '',
  companycam_company_name text not null default '',
  webhook_id text not null default '',
  webhook_token text not null default '',
  linked boolean not null default false,
  linked_at timestamptz,
  linked_by text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.companycam_connections add column if not exists access_token text;
alter table public.companycam_connections add column if not exists token_hint text;
alter table public.companycam_connections add column if not exists companycam_company_id text;
alter table public.companycam_connections add column if not exists companycam_company_name text;
alter table public.companycam_connections add column if not exists webhook_id text;
alter table public.companycam_connections add column if not exists webhook_token text;
alter table public.companycam_connections add column if not exists linked boolean;
alter table public.companycam_connections add column if not exists linked_at timestamptz;
alter table public.companycam_connections add column if not exists linked_by text;
alter table public.companycam_connections add column if not exists updated_at timestamptz;
alter table public.companycam_connections add column if not exists created_at timestamptz;

update public.companycam_connections set access_token = coalesce(access_token, '') where access_token is null;
update public.companycam_connections set token_hint = coalesce(token_hint, '') where token_hint is null;
update public.companycam_connections set companycam_company_id = coalesce(companycam_company_id, '') where companycam_company_id is null;
update public.companycam_connections set companycam_company_name = coalesce(companycam_company_name, '') where companycam_company_name is null;
update public.companycam_connections set webhook_id = coalesce(webhook_id, '') where webhook_id is null;
update public.companycam_connections set webhook_token = coalesce(webhook_token, '') where webhook_token is null;
update public.companycam_connections set linked = coalesce(linked, false) where linked is null;
update public.companycam_connections set linked_by = coalesce(linked_by, '') where linked_by is null;
update public.companycam_connections set updated_at = coalesce(updated_at, now()) where updated_at is null;
update public.companycam_connections set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.companycam_connections alter column access_token set default '';
alter table public.companycam_connections alter column access_token set not null;
alter table public.companycam_connections alter column token_hint set default '';
alter table public.companycam_connections alter column token_hint set not null;
alter table public.companycam_connections alter column companycam_company_id set default '';
alter table public.companycam_connections alter column companycam_company_id set not null;
alter table public.companycam_connections alter column companycam_company_name set default '';
alter table public.companycam_connections alter column companycam_company_name set not null;
alter table public.companycam_connections alter column webhook_id set default '';
alter table public.companycam_connections alter column webhook_id set not null;
alter table public.companycam_connections alter column webhook_token set default '';
alter table public.companycam_connections alter column webhook_token set not null;
alter table public.companycam_connections alter column linked set default false;
alter table public.companycam_connections alter column linked set not null;
alter table public.companycam_connections alter column linked_by set default '';
alter table public.companycam_connections alter column linked_by set not null;
alter table public.companycam_connections alter column updated_at set default now();
alter table public.companycam_connections alter column updated_at set not null;
alter table public.companycam_connections alter column created_at set default now();
alter table public.companycam_connections alter column created_at set not null;

create unique index if not exists companycam_connections_webhook_token_idx
  on public.companycam_connections (webhook_token)
  where webhook_token <> '';

alter table public.companycam_connections enable row level security;

drop policy if exists "company isolation" on public.companycam_connections;
create policy "company isolation" on public.companycam_connections
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.companycam_connections to authenticated;

create table if not exists public.companycam_job_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  companycam_project_id text not null,
  project_name text not null default '',
  project_url text not null default '',
  address_line text not null default '',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companycam_job_links add column if not exists companycam_project_id text;
alter table public.companycam_job_links add column if not exists project_name text;
alter table public.companycam_job_links add column if not exists project_url text;
alter table public.companycam_job_links add column if not exists address_line text;
alter table public.companycam_job_links add column if not exists last_synced_at timestamptz;
alter table public.companycam_job_links add column if not exists created_at timestamptz;
alter table public.companycam_job_links add column if not exists updated_at timestamptz;

update public.companycam_job_links set companycam_project_id = coalesce(companycam_project_id, '') where companycam_project_id is null;
update public.companycam_job_links set project_name = coalesce(project_name, '') where project_name is null;
update public.companycam_job_links set project_url = coalesce(project_url, '') where project_url is null;
update public.companycam_job_links set address_line = coalesce(address_line, '') where address_line is null;
update public.companycam_job_links set created_at = coalesce(created_at, now()) where created_at is null;
update public.companycam_job_links set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.companycam_job_links alter column companycam_project_id set default '';
alter table public.companycam_job_links alter column companycam_project_id set not null;
alter table public.companycam_job_links alter column project_name set default '';
alter table public.companycam_job_links alter column project_name set not null;
alter table public.companycam_job_links alter column project_url set default '';
alter table public.companycam_job_links alter column project_url set not null;
alter table public.companycam_job_links alter column address_line set default '';
alter table public.companycam_job_links alter column address_line set not null;
alter table public.companycam_job_links alter column created_at set default now();
alter table public.companycam_job_links alter column created_at set not null;
alter table public.companycam_job_links alter column updated_at set default now();
alter table public.companycam_job_links alter column updated_at set not null;

create unique index if not exists companycam_job_links_job_idx
  on public.companycam_job_links (company_id, job_id);
create unique index if not exists companycam_job_links_project_idx
  on public.companycam_job_links (company_id, companycam_project_id);

alter table public.companycam_job_links enable row level security;

drop policy if exists "company isolation" on public.companycam_job_links;
create policy "company isolation" on public.companycam_job_links
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.companycam_job_links to authenticated;

alter table public.job_photos
  add column if not exists companycam_photo_id text not null default '';

create unique index if not exists job_photos_companycam_photo_idx
  on public.job_photos (company_id, companycam_photo_id)
  where companycam_photo_id <> '';

-- Token-gated photo ingest. The webhook URL carries an unguessable token.
-- The function never returns the CompanyCam access token.
create or replace function public.companycam_ingest_photo(
  p_token text,
  p_project_id text,
  p_photo_id text,
  p_image_url text,
  p_caption text default '',
  p_taken_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.companycam_connections%rowtype;
  v_link public.companycam_job_links%rowtype;
  v_photo public.job_photos%rowtype;
  v_caption text;
  v_taken date;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;
  if coalesce(trim(p_project_id), '') = '' or coalesce(trim(p_photo_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_photo');
  end if;
  if coalesce(p_image_url, '') !~ '^https://' or position('companycam' in lower(p_image_url)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_image_url');
  end if;

  select * into v_conn
  from public.companycam_connections
  where webhook_token = trim(p_token)
    and linked = true
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_link
  from public.companycam_job_links
  where company_id = v_conn.company_id
    and companycam_project_id = trim(p_project_id)
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'project_not_linked');
  end if;

  v_caption := left(coalesce(trim(p_caption), ''), 500);
  v_taken := coalesce(p_taken_on, current_date);

  select * into v_photo
  from public.job_photos
  where company_id = v_conn.company_id
    and companycam_photo_id = trim(p_photo_id)
  limit 1;

  if found then
    if v_photo.deleted_at is null then
      update public.job_photos
      set
        image_url = p_image_url,
        caption = case when v_caption <> '' then v_caption else caption end,
        taken_at = v_taken
      where id = v_photo.id;
    end if;
    update public.companycam_job_links
    set last_synced_at = now(), updated_at = now()
    where id = v_link.id;
    return jsonb_build_object(
      'ok', true,
      'updated', v_photo.deleted_at is null,
      'skipped', v_photo.deleted_at is not null,
      'photoId', v_photo.id
    );
  end if;

  insert into public.job_photos (
    company_id,
    job_id,
    caption,
    category,
    taken_at,
    image_url,
    storage_path,
    created_by,
    companycam_photo_id
  )
  values (
    v_conn.company_id,
    v_link.job_id,
    coalesce(nullif(v_caption, ''), 'CompanyCam'),
    'progress',
    v_taken,
    p_image_url,
    null,
    'CompanyCam',
    trim(p_photo_id)
  )
  returning * into v_photo;

  update public.companycam_job_links
  set last_synced_at = now(), updated_at = now()
  where id = v_link.id;

  return jsonb_build_object('ok', true, 'inserted', true, 'photoId', v_photo.id);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'duplicate');
end;
$$;

revoke all on function public.companycam_ingest_photo(text, text, text, text, text, date) from public;
grant execute on function public.companycam_ingest_photo(text, text, text, text, text, date) to anon, authenticated, service_role;
