-- The dialer script's DROP POLICY takes AccessExclusiveLock on calling_settings
-- and also waits for AccessExclusiveLock on storage.buckets. Supabase's
-- public-bucket advisor reads storage.buckets first, then scans public tables.
-- Those two lock orders deadlock. Lock buckets first so the sessions queue.

do $outer$
begin
  if to_regclass('storage.buckets') is not null then
    lock table storage.buckets in access exclusive mode;
  end if;

  if to_regclass('public.calling_settings') is not null then
    execute 'drop policy if exists "company isolation" on public.calling_settings';
    execute $p$
      create policy "company isolation" on public.calling_settings
        for all to authenticated
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id())
    $p$;
  end if;

  if to_regclass('public.call_endpoints') is not null then
    execute 'drop policy if exists "company isolation" on public.call_endpoints';
    execute $p$
      create policy "company isolation" on public.call_endpoints
        for all to authenticated
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id())
    $p$;
  end if;

  if to_regclass('public.call_queues') is not null then
    execute 'drop policy if exists "company isolation" on public.call_queues';
    execute $p$
      create policy "company isolation" on public.call_queues
        for all to authenticated
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id())
    $p$;
  end if;

  if to_regclass('public.call_queue_members') is not null then
    execute 'drop policy if exists "company isolation" on public.call_queue_members';
    execute $p$
      create policy "company isolation" on public.call_queue_members
        for all to authenticated
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id())
    $p$;
  end if;

  if to_regclass('public.call_routes') is not null then
    execute 'drop policy if exists "company isolation" on public.call_routes';
    execute $p$
      create policy "company isolation" on public.call_routes
        for all to authenticated
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id())
    $p$;
  end if;

  if to_regclass('public.call_sessions') is not null then
    execute 'drop policy if exists "company isolation" on public.call_sessions';
    execute $p$
      create policy "company isolation" on public.call_sessions
        for all to authenticated
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id())
    $p$;
  end if;

  if to_regclass('public.call_legs') is not null then
    execute 'drop policy if exists "company isolation" on public.call_legs';
    execute $p$
      create policy "company isolation" on public.call_legs
        for all to authenticated
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id())
    $p$;
  end if;

  if to_regprocedure('public.calling_mint_webhook_token()') is not null then
    execute $fn$
      create or replace function public.calling_mint_webhook_token()
      returns text
      language plpgsql
      set search_path = public
      as $body$
      begin
        return encode(extensions.gen_random_bytes(24), 'hex');
      end;
      $body$
    $fn$;
  end if;
end
$outer$;
