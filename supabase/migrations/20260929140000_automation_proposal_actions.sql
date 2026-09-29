-- Proposal automations can set a job's value, move its stage, and leave a note.
-- Delayed runs and homeowner signing use these security-definer helpers.

create or replace function public.automation_apply_job(
  p_job_id uuid,
  p_set_value boolean,
  p_value numeric,
  p_stage text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_opp uuid;
  v_status public.job_status;
  v_stage public.pipeline_stage;
  v_set_stage boolean := false;
begin
  select company_id, opportunity_id into v_company, v_opp
  from public.jobs
  where id = p_job_id;
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'That job is gone.');
  end if;

  if p_set_value then
    update public.jobs
    set contract_value = coalesce(p_value, 0)
    where id = p_job_id;
    if v_opp is not null then
      update public.opportunities
      set value = coalesce(p_value, 0)
      where id = v_opp;
    end if;
  end if;

  if coalesce(p_stage, '') <> '' then
    if p_stage = 'lead' then
      v_status := 'precon'; v_stage := 'pursuing'; v_set_stage := true;
    elsif p_stage = 'proposal_sent' then
      v_status := 'precon'; v_stage := 'bid_submitted'; v_set_stage := true;
    elsif p_stage = 'supplementing' or p_stage = 'estimating' then
      v_status := 'precon'; v_stage := 'supplementing'; v_set_stage := true;
    elsif p_stage = 'in_progress' then
      v_status := 'in_progress'; v_stage := 'awarded'; v_set_stage := true;
    elsif p_stage = 'punch' then
      v_status := 'punch'; v_stage := 'awarded'; v_set_stage := true;
    elsif p_stage = 'complete' then
      v_status := 'complete'; v_stage := 'awarded'; v_set_stage := true;
    elsif p_stage = 'on_hold' then
      v_status := 'on_hold'; v_set_stage := false;
    elsif p_stage = 'lost' then
      v_status := 'on_hold'; v_stage := 'lost'; v_set_stage := true;
    else
      return jsonb_build_object('ok', false, 'error', 'Pick a stage.');
    end if;
    update public.jobs set status = v_status where id = p_job_id;
    if v_set_stage and v_opp is not null then
      update public.opportunities set stage = v_stage where id = v_opp;
    end if;
  end if;

  if coalesce(trim(p_note), '') <> '' then
    insert into public.activities (company_id, entity_type, entity_id, type, body, author)
    values (v_company, 'job', p_job_id, 'note', trim(p_note), 'Automation');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.automation_apply_job(uuid, boolean, numeric, text, text) from public;
grant execute on function public.automation_apply_job(uuid, boolean, numeric, text, text) to anon, authenticated;

create or replace function public.automation_estimate_bundle(p_estimate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'estimate', to_jsonb(e),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.sort_order)
      from public.estimate_lines l
      where l.estimate_id = e.id
    ), '[]'::jsonb),
    'job_market', coalesce(j.market, ''),
    'opportunity_market', coalesce(o.market, '')
  )
  from public.estimates e
  left join public.jobs j on j.id = e.job_id
  left join public.opportunities o on o.id = e.opportunity_id
  where e.id = p_estimate_id;
$$;

revoke all on function public.automation_estimate_bundle(uuid) from public;
grant execute on function public.automation_estimate_bundle(uuid) to anon, authenticated;

create or replace function public.automation_due_runs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
        'automation', to_jsonb(a),
        'contact_phone', coalesce(c.phone, ''),
        'contact_email', coalesce(c.email, ''),
        'contact_name', coalesce(c.name, ''),
        'owner_phone', coalesce(tm.phone, ''),
        'owner_email', coalesce(tm.email, ''),
        'owner_name', coalesce(tm.name, ''),
        'owner_staff_id', coalesce(j.owner_staff_id::text, ''),
        'job_name', coalesce(j.name, ''),
        'job_code', coalesce(j.code, ''),
        'job_city', coalesce(j.city, ''),
        'job_street', coalesce(j.street, ''),
        'job_state', coalesce(j.state, ''),
        'job_postal', coalesce(j.postal_code, ''),
        'job_status', coalesce(j.status::text, ''),
        'contract_value', coalesce(j.contract_value, 0),
        'opportunity_id', coalesce(j.opportunity_id::text, ''),
        'opportunity_stage', coalesce(o.stage::text, ''),
        'company_name', coalesce(co.name, ''),
        'company_phone', coalesce(co.phone, ''),
        'review_url', coalesce(gl.review_url, ''),
        'staff', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'phone', coalesce(s.phone, ''),
            'email', coalesce(s.email, '')
          ))
          from public.team_members s
          where s.company_id = r.company_id
        ), '[]'::jsonb)
      ))
      from public.automation_runs r
      join public.automations a on a.id = r.automation_id
      left join public.jobs j on j.id = r.job_id
      left join public.opportunities o on o.id = j.opportunity_id
      left join public.contacts c on c.id = j.primary_contact_id
      left join public.team_members tm on tm.id = j.owner_staff_id
      left join public.companies co on co.id = r.company_id
      left join lateral (
        select review_url
        from public.google_locations
        where company_id = r.company_id
        order by is_default desc, created_at
        limit 1
      ) gl on true
      where r.status = 'scheduled'
        and r.dry_run = false
        and r.scheduled_for is not null
        and r.scheduled_for <= now()
        and a.enabled = true
      limit 50
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.automation_due_runs() from public;
grant execute on function public.automation_due_runs() to anon, authenticated;

create or replace function public.automation_share_context(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'company_id', e.company_id,
    'estimate_id', e.id,
    'job_id', e.job_id,
    'opportunity_id', coalesce(e.opportunity_id, j.opportunity_id),
    'contact_id', j.primary_contact_id,
    'owner_staff_id', j.owner_staff_id,
    'company_name', coalesce(co.name, ''),
    'company_phone', coalesce(co.phone, ''),
    'contact_name', coalesce(c.name, ''),
    'contact_phone', coalesce(c.phone, ''),
    'contact_email', coalesce(c.email, ''),
    'job_name', coalesce(j.name, ''),
    'job_code', coalesce(j.code, ''),
    'job_city', coalesce(j.city, ''),
    'job_street', coalesce(j.street, ''),
    'job_state', coalesce(j.state, ''),
    'job_postal', coalesce(j.postal_code, ''),
    'job_status', coalesce(j.status::text, ''),
    'contract_value', coalesce(j.contract_value, 0),
    'opportunity_stage', coalesce(o.stage::text, ''),
    'review_url', coalesce(gl.review_url, ''),
    'automations', coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.automations a
      where a.company_id = e.company_id
        and a.enabled = true
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'phone', coalesce(s.phone, ''),
        'email', coalesce(s.email, '')
      ))
      from public.team_members s
      where s.company_id = e.company_id
    ), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'automation_id', r.automation_id,
        'job_id', r.job_id,
        'status', r.status,
        'dry_run', r.dry_run
      ))
      from public.automation_runs r
      where r.company_id = e.company_id
        and j.id is not null
        and r.job_id = j.id
      limit 200
    ), '[]'::jsonb)
  )
  from public.estimates e
  left join public.jobs j on j.id = e.job_id
  left join public.opportunities o on o.id = coalesce(e.opportunity_id, j.opportunity_id)
  left join public.contacts c on c.id = j.primary_contact_id
  left join public.companies co on co.id = e.company_id
  left join lateral (
    select review_url
    from public.google_locations
    where company_id = e.company_id
    order by is_default desc, created_at
    limit 1
  ) gl on true
  where e.share_token = p_token
     or e.second_share_token = p_token
  limit 1;
$$;

revoke all on function public.automation_share_context(text) from public;
grant execute on function public.automation_share_context(text) to anon, authenticated;

insert into public.automation_templates (
  slug, name, description, trigger_kind, trigger_config, conditions, actions,
  requires_confirmation, once_per_job, sort_order
) values
(
  'proposal-sent-value',
  'When a proposal is sent, update the job',
  'Set the job value to the proposal total and move the card to Proposal sent.',
  'estimate_sent',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"set_job_value","valueMode":"estimate"},{"id":"t2","kind":"set_job_stage","stage":"proposal_sent"}]'::jsonb,
  false,
  false,
  60
),
(
  'proposal-won-value',
  'When a proposal is won, update the job',
  'Set the job value to the signed total and move the card to In progress.',
  'estimate_won',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"set_job_value","valueMode":"estimate"},{"id":"t2","kind":"set_job_stage","stage":"in_progress"}]'::jsonb,
  false,
  true,
  70
),
(
  'proposal-lost-value',
  'When a proposal is lost, clear the job',
  'Set the job value to $0 and move the card to Lost.',
  'estimate_lost',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"set_job_value","valueMode":"zero"},{"id":"t2","kind":"set_job_stage","stage":"lost"}]'::jsonb,
  false,
  true,
  80
),
(
  'proposal-sent-text-owner',
  'Text the owner when a proposal is sent',
  'The job owner gets a text as soon as the proposal goes out.',
  'estimate_sent',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"rep","body":"{{jobCode}} proposal sent to {{contactName}} for {{estimateTotal}}."}]'::jsonb,
  false,
  false,
  90
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  trigger_kind = excluded.trigger_kind,
  trigger_config = excluded.trigger_config,
  conditions = excluded.conditions,
  actions = excluded.actions,
  requires_confirmation = excluded.requires_confirmation,
  once_per_job = excluded.once_per_job,
  sort_order = excluded.sort_order;

notify pgrst, 'reload schema';
