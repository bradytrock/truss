-- Inbox read receipts were rewritten on every render. Each update was in the
-- realtime publication, so the desk reloaded the whole company book and Auth
-- could not get a database connection (login returned 504). Ignore a repeat
-- open that lands within two seconds, and stop publishing those rows.

create or replace function public.throttle_message_thread_open()
returns trigger
language plpgsql
as $$
begin
  if old.opened_at > now() - interval '2 seconds' then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists throttle_message_thread_open on public.message_thread_opens;
create trigger throttle_message_thread_open
  before update on public.message_thread_opens
  for each row
  execute function public.throttle_message_thread_open();

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_thread_opens'
  ) then
    execute 'alter publication supabase_realtime drop table public.message_thread_opens';
  end if;
end $$;
