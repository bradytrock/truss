-- Mobile thread contract: explicit members + per-user opened-at.
-- thread_key matches iOS: p: + last 10 US digits, else c: + contact uuid.

create table if not exists public.message_thread_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  thread_key text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  unique (company_id, thread_key, profile_id)
);

create index if not exists message_thread_members_company_thread_idx
  on public.message_thread_members (company_id, thread_key);

create table if not exists public.message_thread_opens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  thread_key text not null,
  opened_at timestamptz not null default now(),
  unique (company_id, profile_id, thread_key)
);

create index if not exists message_thread_opens_profile_idx
  on public.message_thread_opens (company_id, profile_id);

alter table public.message_thread_members enable row level security;
alter table public.message_thread_opens enable row level security;
alter table public.message_thread_members replica identity full;
alter table public.message_thread_opens replica identity full;

drop policy if exists "company isolation" on public.message_thread_members;
create policy "company isolation" on public.message_thread_members
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "company isolation" on public.message_thread_opens;
create policy "company isolation" on public.message_thread_opens
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

revoke all on public.message_thread_members from anon, public;
revoke all on public.message_thread_opens from anon, public;
grant select, insert, update, delete on public.message_thread_members to authenticated;
grant select, insert, update, delete on public.message_thread_opens to authenticated;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.message_thread_members';
  exception
    when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.message_thread_opens';
  exception
    when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
