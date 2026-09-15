-- Named estimate options (not only Good / Better / Best).
-- Shared work still uses package = ''. Each option section uses its own key (opt_1, …).

alter table public.estimates drop constraint if exists estimates_selected_package_check;
alter table public.estimate_lines drop constraint if exists estimate_lines_package_check;

create or replace function public.select_shared_estimate_package(
  p_token text,
  p_package text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  v_token text;
  v_package text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_package := trim(coalesce(p_package, ''));
  if v_package = '' then
    raise exception 'Option is required';
  end if;
  v_token := trim(p_token);

  select * into est
  from public.estimates
  where share_token = v_token
     or (second_share_token <> '' and second_share_token = v_token)
  limit 1;
  if not found then
    return null;
  end if;
  if est.status not in ('draft', 'sent', 'viewed') then
    return public.shared_estimate(v_token);
  end if;
  if coalesce(est.package_mode, '') <> 'gbb' then
    return public.shared_estimate(v_token);
  end if;
  if v_package not in ('good', 'better', 'best')
     and not exists (
       select 1
       from public.estimate_lines line
       where line.estimate_id = est.id
         and line.package = v_package
     )
  then
    raise exception 'Unknown option';
  end if;

  update public.estimates
  set selected_package = v_package
  where id = est.id;

  return public.shared_estimate(v_token);
end;
$$;

revoke all on function public.select_shared_estimate_package(text, text) from public;
grant execute on function public.select_shared_estimate_package(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
