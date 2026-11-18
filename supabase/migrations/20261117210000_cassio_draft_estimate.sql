-- Cassio reads a job's notes, then saves a draft estimate for review.
-- The draft is never marked sent.

create or replace function public.cassio_job_notes(p_token text, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_company uuid;
  v_role text;
  v_seat text;
  v_admin boolean;
  v_query text;
  v_count integer;
  v_job public.jobs%rowtype;
  v_contact text;
  v_squares numeric;
  v_notes jsonb;
  v_templates jsonb;
  v_gaps jsonb := '[]'::jsonb;
begin
  select l.staff_id, l.company_id, m.role::text, coalesce(m.name, '')
    into v_staff, v_company, v_role, v_seat
  from public.cassio_line_secrets s
  join public.cassio_lines l on l.staff_id = s.staff_id
  join public.team_members m on m.id = l.staff_id
  where s.mcp_token = trim(coalesce(p_token, ''))
  limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'This number is not connected to a Truss book.');
  end if;
  v_admin := v_role in ('company_admin', 'director');
  v_query := trim(regexp_replace(coalesce(p_query, ''), '[%_\\]', '', 'g'));
  if length(v_query) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Name the job.');
  end if;

  select count(*) into v_count
  from public.jobs j
  left join public.contacts ct on ct.id = j.primary_contact_id
  where j.company_id = v_company
    and j.deleted_at is null
    and (
      j.name ilike '%' || v_query || '%'
      or j.code ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (
      v_admin
      or j.owner_staff_id = v_staff
      or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
      or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
    );
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No job in this book matched.');
  end if;
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'More than one job matched. Use the job code.');
  end if;

  select j.* into v_job
  from public.jobs j
  left join public.contacts ct on ct.id = j.primary_contact_id
  where j.company_id = v_company
    and j.deleted_at is null
    and (
      j.name ilike '%' || v_query || '%'
      or j.code ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (
      v_admin
      or j.owner_staff_id = v_staff
      or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
      or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
    )
  limit 1;

  select ct.name into v_contact from public.contacts ct where ct.id = v_job.primary_contact_id;

  select e.total_squares into v_squares
  from public.eagleview_orders e
  where e.company_id = v_company
    and e.job_id = v_job.id
    and e.total_squares is not null
    and e.total_squares > 0
  order by e.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type', n.type,
    'body', n.body
  ) order by n.created_at desc), '[]'::jsonb)
    into v_notes
  from (
    select a.type::text as type, a.body, a.created_at
    from public.activities a
    where a.company_id = v_company
      and a.entity_type = 'job'
      and a.entity_id = v_job.id
      and a.type in ('note', 'call', 'text', 'site_walk', 'meeting', 'email')
    order by a.created_at desc
    limit 12
  ) n;

  select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb)
    into v_templates
  from public.estimate_templates t
  where t.company_id = v_company;

  if v_squares is null then
    v_gaps := v_gaps || jsonb_build_array('square count');
  end if;
  v_gaps := v_gaps || jsonb_build_array('template name');

  return jsonb_build_object(
    'ok', true,
    'code', coalesce(v_job.code, ''),
    'name', coalesce(v_job.name, ''),
    'contact', coalesce(v_contact, ''),
    'address', trim(both ' ' from concat_ws(', ',
      nullif(trim(v_job.street), ''),
      nullif(trim(concat_ws(' ', v_job.city, v_job.state)), '')
    )),
    'description', coalesce(v_job.description, ''),
    'notes', v_notes,
    'squares', v_squares,
    'templates', v_templates,
    'gaps', v_gaps
  );
end;
$$;

create or replace function public.cassio_draft_estimate(
  p_token text,
  p_query text,
  p_template text,
  p_squares numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_company uuid;
  v_role text;
  v_seat text;
  v_admin boolean;
  v_query text;
  v_template_query text;
  v_count integer;
  v_job public.jobs%rowtype;
  v_template public.estimate_templates%rowtype;
  v_squares numeric;
  v_seq integer;
  v_number text;
  v_estimate uuid;
  v_tax numeric;
  v_total numeric;
  v_lines jsonb;
  v_try integer;
begin
  select l.staff_id, l.company_id, m.role::text, coalesce(m.name, 'Cassio')
    into v_staff, v_company, v_role, v_seat
  from public.cassio_line_secrets s
  join public.cassio_lines l on l.staff_id = s.staff_id
  join public.team_members m on m.id = l.staff_id
  where s.mcp_token = trim(coalesce(p_token, ''))
  limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'This number is not connected to a Truss book.');
  end if;
  if v_role = 'business_development' then
    return jsonb_build_object('ok', false, 'error', 'This seat does not write estimates.');
  end if;
  v_admin := v_role in ('company_admin', 'director');
  v_query := trim(regexp_replace(coalesce(p_query, ''), '[%_\\]', '', 'g'));
  v_template_query := trim(regexp_replace(coalesce(p_template, ''), '[%_\\]', '', 'g'));
  if length(v_query) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Name the job.');
  end if;
  if length(v_template_query) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Name the estimate template to use.');
  end if;

  select count(*) into v_count
  from public.jobs j
  left join public.contacts ct on ct.id = j.primary_contact_id
  where j.company_id = v_company
    and j.deleted_at is null
    and (
      j.name ilike '%' || v_query || '%'
      or j.code ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (
      v_admin
      or j.owner_staff_id = v_staff
      or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
      or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
    );
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No job in this book matched.');
  end if;
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'More than one job matched. Use the job code.');
  end if;

  select j.* into v_job
  from public.jobs j
  left join public.contacts ct on ct.id = j.primary_contact_id
  where j.company_id = v_company
    and j.deleted_at is null
    and (
      j.name ilike '%' || v_query || '%'
      or j.code ilike '%' || v_query || '%'
      or coalesce(ct.name, '') ilike '%' || v_query || '%'
    )
    and (
      v_admin
      or j.owner_staff_id = v_staff
      or (v_seat <> '' and lower(j.project_manager) = lower(v_seat))
      or v_staff::text = any(coalesce(j.assigned, array[]::text[]))
    )
  limit 1;

  select count(*) into v_count
  from public.estimate_templates t
  where t.company_id = v_company
    and t.name ilike '%' || v_template_query || '%';
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No estimate template matched that name.');
  end if;
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'More than one template matched. Use its full name.');
  end if;
  select t.* into v_template
  from public.estimate_templates t
  where t.company_id = v_company
    and t.name ilike '%' || v_template_query || '%'
  limit 1;

  v_squares := p_squares;
  if v_squares is null or v_squares <= 0 then
    select e.total_squares into v_squares
    from public.eagleview_orders e
    where e.company_id = v_company
      and e.job_id = v_job.id
      and e.total_squares is not null
      and e.total_squares > 0
    order by e.created_at desc
    limit 1;
  end if;
  if v_squares is null or v_squares <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Need a square count before a draft. Ask for it.');
  end if;

  select coalesce(max(substring(e.number from '(\d+)$')::integer), 1000)
    into v_seq
  from public.estimates e
  where e.company_id = v_company
    and e.number ~ '^EST-[0-9]+$';

  v_tax := case
    when coalesce(v_job.market, 'residential') = 'residential' then 0
    else coalesce(v_template.tax_rate, 0)
  end;

  for v_try in 1..5 loop
    v_seq := v_seq + 1;
    v_number := 'EST-' || v_seq::text;
    begin
      insert into public.estimates (
        company_id, number, name, client_id, opportunity_id, job_id, contact_id,
        status, notes, valid_until, street, city, state, postal_code, share_token,
        intro, terms, tax_rate, discount_kind, discount_value, deposit_kind, deposit_value,
        package_mode, selected_package, margin_percent
      )
      values (
        v_company,
        v_number,
        coalesce(nullif(v_job.name, ''), v_template.name),
        v_job.client_id,
        v_job.opportunity_id,
        v_job.id,
        v_job.primary_contact_id,
        'draft',
        coalesce(v_template.notes, ''),
        (current_date + 30),
        coalesce(v_job.street, ''),
        coalesce(v_job.city, ''),
        coalesce(v_job.state, ''),
        coalesce(v_job.postal_code, ''),
        encode(gen_random_bytes(16), 'hex'),
        coalesce(v_template.intro, ''),
        coalesce(v_template.terms, ''),
        v_tax,
        coalesce(nullif(v_template.discount_kind, ''), 'percent'),
        coalesce(v_template.discount_value, 0),
        coalesce(nullif(v_template.deposit_kind, ''), 'percent'),
        coalesce(v_template.deposit_value, 0),
        coalesce(v_template.package_mode, ''),
        coalesce(v_template.selected_package, ''),
        0
      )
      returning id into v_estimate;
      exit;
    exception when unique_violation then
      v_estimate := null;
    end;
  end loop;
  if v_estimate is null then
    return jsonb_build_object('ok', false, 'error', 'Could not number the draft.');
  end if;

  insert into public.estimate_lines (
    company_id, estimate_id, catalog_item_id, title, description, quantity, unit, unit_cost,
    sort_order, group_name, optional, selected, taxable, quantity_formula, measurement_key,
    coverage_amount, coverage_unit, package
  )
  select
    v_company,
    v_estimate,
    l.catalog_item_id,
    coalesce(l.title, ''),
    coalesce(l.description, ''),
    case
      when lower(coalesce(l.unit, '')) in ('sq', 'square', 'squares')
        or coalesce(l.measurement_key, '') ilike '%square%'
      then v_squares
      else coalesce(l.quantity, 1)
    end,
    coalesce(nullif(l.unit, ''), 'LS'),
    coalesce(l.unit_cost, 0),
    coalesce(l.sort_order, 0),
    coalesce(l.group_name, ''),
    coalesce(l.optional, false),
    coalesce(l.selected, true),
    coalesce(l.taxable, true),
    coalesce(l.quantity_formula, ''),
    coalesce(l.measurement_key, ''),
    coalesce(l.coverage_amount, 0),
    coalesce(l.coverage_unit, ''),
    coalesce(l.package, '')
  from public.estimate_template_lines l
  where l.company_id = v_company
    and l.template_id = v_template.id;

  select coalesce(sum(l.quantity * l.unit_cost), 0)
    into v_total
  from public.estimate_lines l
  where l.estimate_id = v_estimate
    and (l.optional = false or l.selected = true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'title', coalesce(nullif(l.title, ''), nullif(l.description, ''), 'Line'),
    'quantity', l.quantity,
    'unit', l.unit
  ) order by l.sort_order), '[]'::jsonb)
    into v_lines
  from public.estimate_lines l
  where l.estimate_id = v_estimate;

  insert into public.activities (company_id, entity_type, entity_id, type, body, author)
  values (
    v_company,
    'job',
    v_job.id,
    'note',
    'Draft ' || v_number || ' is ready for review.',
    v_seat
  );

  return jsonb_build_object(
    'ok', true,
    'number', v_number,
    'name', coalesce(nullif(v_job.name, ''), v_template.name),
    'code', coalesce(v_job.code, ''),
    'template', v_template.name,
    'squares', v_squares,
    'lines', v_lines,
    'total', v_total,
    'status', 'draft'
  );
end;
$$;

revoke all on function public.cassio_job_notes(text, text) from public;
revoke all on function public.cassio_draft_estimate(text, text, text, numeric) from public;
grant execute on function public.cassio_job_notes(text, text) to anon, authenticated, service_role;
grant execute on function public.cassio_draft_estimate(text, text, text, numeric) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
