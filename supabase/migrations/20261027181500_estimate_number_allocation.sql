-- Estimate numbers were chosen in the browser from whatever rows that tab had
-- loaded. Two creates then inserted the same (company_id, number) and Postgres
-- rejected the second with estimates_company_number_idx. This counter hands out
-- the next number inside one transaction. A failed insert leaves a gap, which
-- is cheaper than a duplicate. Safe to re-run.

create table if not exists public.document_counters (
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null,
  last_value integer not null,
  primary key (company_id, kind),
  constraint document_counters_kind_check check (kind = 'estimate'),
  constraint document_counters_last_value_check check (last_value >= 0)
);

alter table public.document_counters enable row level security;

revoke all on table public.document_counters from public, anon, authenticated;

create or replace function public.allocate_estimate_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_floor integer;
  v_next integer;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Serialize allocators for this company so two creates cannot read the same max.
  perform pg_advisory_xact_lock(hashtext(v_company::text || ':estimate'));

  select coalesce(max(suffix), 1000)
  into v_floor
  from (
    select case
      when substring(number from '([0-9]+)$') ~ '^[0-9]{1,9}$'
        then substring(number from '([0-9]+)$')::integer
      else null
    end as suffix
    from public.estimates
    where company_id = v_company
  ) numbered;

  insert into public.document_counters as counter (company_id, kind, last_value)
  values (v_company, 'estimate', v_floor + 1)
  on conflict (company_id, kind)
  do update set last_value = greatest(counter.last_value, v_floor) + 1
  returning last_value into v_next;

  return 'EST-' || v_next::text;
end;
$$;

revoke all on function public.allocate_estimate_number() from public, anon;
grant execute on function public.allocate_estimate_number() to authenticated;

notify pgrst, 'reload schema';
