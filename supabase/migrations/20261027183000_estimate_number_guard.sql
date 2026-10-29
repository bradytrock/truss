-- The app that is already open still picks the next estimate number from memory.
-- Rewrite a colliding insert to the next free number so that create succeeds
-- instead of raising estimates_company_number_idx. Safe to re-run.

create or replace function public.issue_estimate_number(p_company uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_floor integer;
  v_next integer;
begin
  if p_company is null then
    raise exception 'missing company' using errcode = '23502';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_company::text || ':estimate'));

  select coalesce(max(suffix), 1000)
  into v_floor
  from (
    select case
      when substring(number from '([0-9]+)$') ~ '^[0-9]{1,9}$'
        then substring(number from '([0-9]+)$')::integer
      else null
    end as suffix
    from public.estimates
    where company_id = p_company
  ) numbered;

  insert into public.document_counters as counter (company_id, kind, last_value)
  values (p_company, 'estimate', v_floor + 1)
  on conflict (company_id, kind)
  do update set last_value = greatest(counter.last_value, v_floor) + 1
  returning last_value into v_next;

  return 'EST-' || v_next::text;
end;
$$;

revoke all on function public.issue_estimate_number(uuid) from public, anon, authenticated;

create or replace function public.allocate_estimate_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return public.issue_estimate_number(v_company);
end;
$$;

revoke all on function public.allocate_estimate_number() from public, anon;
grant execute on function public.allocate_estimate_number() to authenticated;

create or replace function public.estimates_keep_unique_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suffix integer;
begin
  if new.company_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.company_id::text || ':estimate'));

  if nullif(btrim(coalesce(new.number, '')), '') is null
     or exists (
       select 1
       from public.estimates
       where company_id = new.company_id
         and number = new.number
     ) then
    new.number := public.issue_estimate_number(new.company_id);
    return new;
  end if;

  if new.number ~ '^EST-[0-9]{1,9}$' then
    v_suffix := substring(new.number from '([0-9]+)$')::integer;
    insert into public.document_counters as counter (company_id, kind, last_value)
    values (new.company_id, 'estimate', v_suffix)
    on conflict (company_id, kind)
    do update set last_value = greatest(counter.last_value, excluded.last_value);
  end if;

  return new;
end;
$$;

revoke all on function public.estimates_keep_unique_number() from public, anon;
grant execute on function public.estimates_keep_unique_number() to authenticated, service_role;

drop trigger if exists estimates_keep_unique_number on public.estimates;
create trigger estimates_keep_unique_number
  before insert on public.estimates
  for each row execute function public.estimates_keep_unique_number();
