-- Photon / Spectrum at the company level. Each office stores its own project,
-- dedicated line, and webhook signing secret. The shared text worker only
-- carries the process that stays connected.
-- Safe to re-run.

create table if not exists public.photon_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  project_id text not null default '',
  project_secret text not null default '',
  from_number text not null default '',
  webhook_token text not null default '',
  webhook_id text not null default '',
  webhook_secret text not null default '',
  linked boolean not null default false,
  linked_at timestamptz,
  linked_by text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.photon_connections add column if not exists project_id text;
alter table public.photon_connections add column if not exists project_secret text;
alter table public.photon_connections add column if not exists from_number text;
alter table public.photon_connections add column if not exists webhook_token text;
alter table public.photon_connections add column if not exists webhook_id text;
alter table public.photon_connections add column if not exists webhook_secret text;
alter table public.photon_connections add column if not exists linked boolean;
alter table public.photon_connections add column if not exists linked_at timestamptz;
alter table public.photon_connections add column if not exists linked_by text;
alter table public.photon_connections add column if not exists updated_at timestamptz;
alter table public.photon_connections add column if not exists created_at timestamptz;

update public.photon_connections set project_id = coalesce(project_id, '') where project_id is null;
update public.photon_connections set project_secret = coalesce(project_secret, '') where project_secret is null;
update public.photon_connections set from_number = coalesce(from_number, '') where from_number is null;
update public.photon_connections set webhook_token = coalesce(webhook_token, '') where webhook_token is null;
update public.photon_connections set webhook_id = coalesce(webhook_id, '') where webhook_id is null;
update public.photon_connections set webhook_secret = coalesce(webhook_secret, '') where webhook_secret is null;
update public.photon_connections set linked = coalesce(linked, false) where linked is null;
update public.photon_connections set linked_by = coalesce(linked_by, '') where linked_by is null;
update public.photon_connections set updated_at = coalesce(updated_at, now()) where updated_at is null;
update public.photon_connections set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.photon_connections alter column project_id set default '';
alter table public.photon_connections alter column project_id set not null;
alter table public.photon_connections alter column project_secret set default '';
alter table public.photon_connections alter column project_secret set not null;
alter table public.photon_connections alter column from_number set default '';
alter table public.photon_connections alter column from_number set not null;
alter table public.photon_connections alter column webhook_token set default '';
alter table public.photon_connections alter column webhook_token set not null;
alter table public.photon_connections alter column webhook_id set default '';
alter table public.photon_connections alter column webhook_id set not null;
alter table public.photon_connections alter column webhook_secret set default '';
alter table public.photon_connections alter column webhook_secret set not null;
alter table public.photon_connections alter column linked set default false;
alter table public.photon_connections alter column linked set not null;
alter table public.photon_connections alter column linked_by set default '';
alter table public.photon_connections alter column linked_by set not null;
alter table public.photon_connections alter column updated_at set default now();
alter table public.photon_connections alter column updated_at set not null;
alter table public.photon_connections alter column created_at set default now();
alter table public.photon_connections alter column created_at set not null;

create unique index if not exists photon_connections_webhook_token_idx
  on public.photon_connections (webhook_token)
  where webhook_token <> '';

alter table public.photon_connections enable row level security;

drop policy if exists "company isolation" on public.photon_connections;
create policy "company isolation" on public.photon_connections
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert, update, delete on table public.photon_connections to authenticated;

-- Webhook URL token is the lookup key. Returns the signing secret for that
-- office only. Does not accept a company id.
create or replace function public.photon_webhook_account(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'companyId', company_id,
    'webhookSecret', webhook_secret,
    'fromNumber', from_number
  )
  from public.photon_connections
  where linked
    and webhook_token <> ''
    and webhook_token = trim(coalesce(p_token, ''))
  limit 1;
$$;

revoke all on function public.photon_webhook_account(text) from public;
grant execute on function public.photon_webhook_account(text) to anon, authenticated;

create or replace function public.photon_company_for_voice(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.voice_agents
  where enabled
    and webhook_token = trim(coalesce(p_token, ''))
  limit 1;
$$;

revoke all on function public.photon_company_for_voice(text) from public;
grant execute on function public.photon_company_for_voice(text) to anon, authenticated;

create or replace function public.photon_company_for_estimate_share(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.estimates
  where length(trim(coalesce(p_token, ''))) >= 6
    and (
      share_token = trim(p_token)
      or (second_share_token <> '' and second_share_token = trim(p_token))
    )
  limit 1;
$$;

revoke all on function public.photon_company_for_estimate_share(text) from public;
grant execute on function public.photon_company_for_estimate_share(text) to anon, authenticated;
