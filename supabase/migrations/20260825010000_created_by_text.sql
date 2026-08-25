-- Live projects sometimes typed payments.created_by / expenses.created_by as uuid.
-- The app stores the recorder's display name (and retries with a uuid if Postgres still expects one).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payments'
      and column_name = 'created_by'
      and udt_name = 'uuid'
  ) then
    execute 'alter table public.payments alter column created_by drop default';
    execute 'alter table public.payments alter column created_by type text using coalesce(created_by::text, '''')';
    execute 'alter table public.payments alter column created_by set default ''''';
    execute 'alter table public.payments alter column created_by set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'created_by'
      and udt_name = 'uuid'
  ) then
    execute 'alter table public.expenses alter column created_by drop default';
    execute 'alter table public.expenses alter column created_by type text using coalesce(created_by::text, '''')';
    execute 'alter table public.expenses alter column created_by set default ''''';
    execute 'alter table public.expenses alter column created_by set not null';
  end if;
end $$;
