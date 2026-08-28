-- Live refresh: the field app and this desk share one Postgres. Realtime only
-- emits tables in supabase_realtime, and UPDATE/DELETE need replica identity
-- FULL so RLS (and company filters) can see the old row. Skip connector
-- secrets and OAuth tokens — those are not the book of work.

do $$
declare
  r record;
begin
  for r in
    select c.relname as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in (
        'calendar_tokens',
        'qbwc_connectors',
        'qbwc_sessions'
      )
      and has_table_privilege('authenticated', format('public.%I', c.relname), 'select')
  loop
    execute format('alter table public.%I replica identity full', r.tbl);
    begin
      execute format('alter publication supabase_realtime add table public.%I', r.tbl);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;
