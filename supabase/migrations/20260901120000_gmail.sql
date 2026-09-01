-- Per-seat Gmail links. Tokens stay RPC-only. Messages can be tagged to a job.
-- Safe to re-run.

create table if not exists public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.team_members (id) on delete cascade,
  google_email text not null default '',
  linked boolean not null default false,
  linked_at timestamptz,
  source text not null default 'demo' check (source in ('demo', 'google')),
  created_at timestamptz not null default now(),
  unique (company_id, staff_id)
);

alter table public.gmail_accounts add column if not exists google_email text;
alter table public.gmail_accounts add column if not exists linked boolean;
alter table public.gmail_accounts add column if not exists linked_at timestamptz;
alter table public.gmail_accounts add column if not exists source text;
alter table public.gmail_accounts add column if not exists created_at timestamptz;

update public.gmail_accounts set google_email = coalesce(google_email, '') where google_email is null;
update public.gmail_accounts set linked = coalesce(linked, false) where linked is null;
update public.gmail_accounts set source = coalesce(nullif(source, ''), 'demo') where source is null or source = '';
update public.gmail_accounts set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.gmail_accounts alter column google_email set default '';
alter table public.gmail_accounts alter column google_email set not null;
alter table public.gmail_accounts alter column linked set default false;
alter table public.gmail_accounts alter column linked set not null;
alter table public.gmail_accounts alter column source set default 'demo';
alter table public.gmail_accounts alter column source set not null;
alter table public.gmail_accounts alter column created_at set default now();
alter table public.gmail_accounts alter column created_at set not null;

do $$
begin
  alter table public.gmail_accounts
    add constraint gmail_accounts_source_check check (source in ('demo', 'google'));
exception
  when duplicate_object then null;
end $$;

create index if not exists gmail_accounts_company_idx on public.gmail_accounts (company_id);
create index if not exists gmail_accounts_staff_idx on public.gmail_accounts (staff_id);

create table if not exists public.gmail_tokens (
  account_id uuid primary key references public.gmail_accounts (id) on delete cascade,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz
);

create table if not exists public.gmail_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  account_id uuid not null references public.gmail_accounts (id) on delete cascade,
  gmail_id text not null default '',
  thread_id text not null default '',
  from_name text not null default '',
  from_email text not null default '',
  to_email text not null default '',
  subject text not null default '',
  snippet text not null default '',
  body_text text not null default '',
  received_at timestamptz not null default now(),
  direction text not null default 'inbound',
  job_id uuid references public.jobs (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, gmail_id)
);

alter table public.gmail_messages add column if not exists gmail_id text;
alter table public.gmail_messages add column if not exists thread_id text;
alter table public.gmail_messages add column if not exists from_name text;
alter table public.gmail_messages add column if not exists from_email text;
alter table public.gmail_messages add column if not exists to_email text;
alter table public.gmail_messages add column if not exists subject text;
alter table public.gmail_messages add column if not exists snippet text;
alter table public.gmail_messages add column if not exists body_text text;
alter table public.gmail_messages add column if not exists received_at timestamptz;
alter table public.gmail_messages add column if not exists direction text;
alter table public.gmail_messages add column if not exists job_id uuid;
alter table public.gmail_messages add column if not exists contact_id uuid;
alter table public.gmail_messages add column if not exists created_at timestamptz;
alter table public.gmail_messages add column if not exists account_id uuid;
alter table public.gmail_messages add column if not exists company_id uuid;

update public.gmail_messages set gmail_id = coalesce(gmail_id, '') where gmail_id is null;
update public.gmail_messages set thread_id = coalesce(thread_id, '') where thread_id is null;
update public.gmail_messages set from_name = coalesce(from_name, '') where from_name is null;
update public.gmail_messages set from_email = coalesce(from_email, '') where from_email is null;
update public.gmail_messages set to_email = coalesce(to_email, '') where to_email is null;
update public.gmail_messages set subject = coalesce(subject, '') where subject is null;
update public.gmail_messages set snippet = coalesce(snippet, '') where snippet is null;
update public.gmail_messages set body_text = coalesce(body_text, '') where body_text is null;
update public.gmail_messages set direction = coalesce(nullif(direction, ''), 'inbound') where direction is null or direction = '';
update public.gmail_messages set received_at = coalesce(received_at, now()) where received_at is null;
update public.gmail_messages set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.gmail_messages alter column gmail_id set default '';
alter table public.gmail_messages alter column gmail_id set not null;
alter table public.gmail_messages alter column thread_id set default '';
alter table public.gmail_messages alter column thread_id set not null;
alter table public.gmail_messages alter column from_name set default '';
alter table public.gmail_messages alter column from_name set not null;
alter table public.gmail_messages alter column from_email set default '';
alter table public.gmail_messages alter column from_email set not null;
alter table public.gmail_messages alter column to_email set default '';
alter table public.gmail_messages alter column to_email set not null;
alter table public.gmail_messages alter column subject set default '';
alter table public.gmail_messages alter column subject set not null;
alter table public.gmail_messages alter column snippet set default '';
alter table public.gmail_messages alter column snippet set not null;
alter table public.gmail_messages alter column body_text set default '';
alter table public.gmail_messages alter column body_text set not null;
alter table public.gmail_messages alter column received_at set default now();
alter table public.gmail_messages alter column received_at set not null;
alter table public.gmail_messages alter column direction set default 'inbound';
alter table public.gmail_messages alter column direction set not null;
alter table public.gmail_messages alter column created_at set default now();
alter table public.gmail_messages alter column created_at set not null;

do $$
begin
  alter table public.gmail_messages
    add constraint gmail_messages_direction_check check (direction in ('inbound', 'outbound'));
exception
  when duplicate_object then null;
end $$;

create index if not exists gmail_messages_company_received_idx on public.gmail_messages (company_id, received_at desc);
create index if not exists gmail_messages_job_id_idx on public.gmail_messages (job_id);
create index if not exists gmail_messages_contact_id_idx on public.gmail_messages (contact_id);
create index if not exists gmail_messages_account_idx on public.gmail_messages (account_id);
create unique index if not exists gmail_messages_account_gmail_id_idx
  on public.gmail_messages (account_id, gmail_id);

alter table public.gmail_accounts enable row level security;
alter table public.gmail_tokens enable row level security;
alter table public.gmail_messages enable row level security;
alter table public.gmail_accounts replica identity full;
alter table public.gmail_messages replica identity full;

drop policy if exists "company isolation" on public.gmail_accounts;
create policy "company isolation" on public.gmail_accounts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.gmail_messages;
create policy "company isolation" on public.gmail_messages
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Tokens never leave through the Data API. Access is RPC-only.
revoke all on public.gmail_tokens from anon, authenticated, public;

grant select, insert, update, delete on public.gmail_accounts to authenticated;
grant select, insert, update, delete on public.gmail_messages to authenticated;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.gmail_accounts';
  exception
    when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.gmail_messages';
  exception
    when duplicate_object then null;
  end;
end $$;

create or replace function public.save_gmail_tokens(
  p_staff_id uuid,
  p_google_email text,
  p_refresh_token text,
  p_access_token text,
  p_token_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account uuid;
  company uuid;
begin
  company := public.current_company_id();
  if company is null then
    raise exception 'Not signed in';
  end if;
  if public.current_staff_id() is distinct from p_staff_id and not public.current_is_company_admin() then
    raise exception 'You can only connect your own Gmail';
  end if;

  insert into public.gmail_accounts (
    company_id, staff_id, google_email, linked, linked_at, source
  )
  values (
    company, p_staff_id, coalesce(p_google_email, ''),
    true, now(), 'google'
  )
  on conflict (company_id, staff_id) do update
    set google_email = excluded.google_email,
        linked = true,
        linked_at = now(),
        source = 'google';

  select id into account
  from public.gmail_accounts
  where company_id = company and staff_id = p_staff_id;

  insert into public.gmail_tokens (account_id, refresh_token, access_token, token_expires_at)
  values (
    account,
    coalesce(nullif(p_refresh_token, ''), (select refresh_token from public.gmail_tokens where account_id = account)),
    p_access_token,
    p_token_expires_at
  )
  on conflict (account_id) do update
    set refresh_token = coalesce(nullif(excluded.refresh_token, ''), public.gmail_tokens.refresh_token),
        access_token = excluded.access_token,
        token_expires_at = excluded.token_expires_at;

  return account;
end;
$$;

revoke all on function public.save_gmail_tokens(uuid, text, text, text, timestamptz) from public;
grant execute on function public.save_gmail_tokens(uuid, text, text, text, timestamptz) to authenticated;

create or replace function public.gmail_credentials(target_staff_id uuid)
returns table (
  account_id uuid,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  google_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_staff_id() is distinct from target_staff_id and not public.current_is_company_admin() then
    raise exception 'Not allowed to read that Gmail account';
  end if;
  return query
    select
      a.id,
      t.refresh_token,
      t.access_token,
      t.token_expires_at,
      a.google_email
    from public.gmail_accounts a
    join public.gmail_tokens t on t.account_id = a.id
    where a.staff_id = target_staff_id
      and a.company_id = public.current_company_id()
      and a.linked = true
      and a.source = 'google';
end;
$$;

revoke all on function public.gmail_credentials(uuid) from public;
grant execute on function public.gmail_credentials(uuid) to authenticated;

create or replace function public.disconnect_gmail(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_staff_id() is distinct from p_staff_id and not public.current_is_company_admin() then
    raise exception 'You can only disconnect your own Gmail';
  end if;
  delete from public.gmail_tokens t
    using public.gmail_accounts a
    where t.account_id = a.id
      and a.staff_id = p_staff_id
      and a.company_id = public.current_company_id();
  update public.gmail_accounts
    set linked = false,
        google_email = '',
        linked_at = null,
        source = 'demo'
    where staff_id = p_staff_id
      and company_id = public.current_company_id();
end;
$$;

revoke all on function public.disconnect_gmail(uuid) from public;
grant execute on function public.disconnect_gmail(uuid) to authenticated;

notify pgrst, 'reload schema';
