-- pgcrypto lives in the extensions schema on hosted Supabase.
-- API roles use search_path = public, so unqualified gen_random_bytes(integer)
-- does not exist. Schema-qualify every remaining call.

do $outer$
declare
  rec record;
  def text;
begin
  for rec in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and position('gen_random_bytes(' in p.prosrc) > 0
      and position('extensions.gen_random_bytes(' in p.prosrc) = 0
  loop
    def := replace(pg_get_functiondef(rec.oid), 'gen_random_bytes(', 'extensions.gen_random_bytes(');
    execute def;
  end loop;

  if to_regprocedure('public.calling_mint_webhook_token()') is not null then
    execute 'alter function public.calling_mint_webhook_token() set search_path = public';
  end if;
end
$outer$;
