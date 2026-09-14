-- Email campaigns: lists from the book, Resend sends, and an unsubscribe list.
-- Separate from marketing_campaigns (print/neighborhood stubs).

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default '',
  audience_kind text not null,
  audience_city text not null default '',
  audience_zip text not null default '',
  include_punch boolean not null default false,
  subject text not null,
  body_text text not null,
  status text not null default 'draft',
  created_by_staff_id text,
  created_by_name text not null default '',
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_campaigns_company_idx
  on public.email_campaigns (company_id, created_at desc);

alter table public.email_campaigns enable row level security;

drop policy if exists "company isolation" on public.email_campaigns;
create policy "company isolation" on public.email_campaigns
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  contact_id text,
  job_id text,
  email text not null,
  recipient_name text not null default '',
  subject text not null default '',
  status text not null,
  error text not null default '',
  resend_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists email_campaign_sends_campaign_idx
  on public.email_campaign_sends (campaign_id, created_at desc);
create index if not exists email_campaign_sends_company_idx
  on public.email_campaign_sends (company_id, created_at desc);

alter table public.email_campaign_sends enable row level security;

drop policy if exists "company isolation" on public.email_campaign_sends;
create policy "company isolation" on public.email_campaign_sends
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create table if not exists public.email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  token text not null unique,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create index if not exists email_unsubscribes_token_idx
  on public.email_unsubscribes (token);
create index if not exists email_unsubscribes_company_email_idx
  on public.email_unsubscribes (company_id, email);

alter table public.email_unsubscribes enable row level security;

drop policy if exists "company isolation" on public.email_unsubscribes;
create policy "company isolation" on public.email_unsubscribes
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create or replace function public.email_unsubscribe_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.email_unsubscribes%rowtype;
  company_name text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return null;
  end if;
  select * into row
  from public.email_unsubscribes
  where token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  select name into company_name from public.companies where id = row.company_id;
  return jsonb_build_object(
    'email', row.email,
    'companyName', coalesce(company_name, ''),
    'unsubscribed', row.unsubscribed_at is not null
  );
end;
$$;

create or replace function public.unsubscribe_email_campaign(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.email_unsubscribes%rowtype;
  company_name text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return null;
  end if;
  update public.email_unsubscribes
  set unsubscribed_at = coalesce(unsubscribed_at, now())
  where token = trim(p_token)
  returning * into row;
  if not found then
    return null;
  end if;
  select name into company_name from public.companies where id = row.company_id;
  return jsonb_build_object(
    'ok', true,
    'email', row.email,
    'companyName', coalesce(company_name, ''),
    'unsubscribed', true
  );
end;
$$;

revoke all on function public.email_unsubscribe_info(text) from public;
grant execute on function public.email_unsubscribe_info(text) to anon, authenticated;
revoke all on function public.unsubscribe_email_campaign(text) from public;
grant execute on function public.unsubscribe_email_campaign(text) to anon, authenticated;
