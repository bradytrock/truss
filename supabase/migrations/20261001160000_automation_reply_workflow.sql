-- Reply maps live in automations.trigger_config.workflow.
-- After the opening actions, a run waits for yes, no, or silence.
-- Inbound texts claim the newest wait for that phone. The hourly cron
-- claims waits whose deadline has passed and runs the no-reply branch.

drop function if exists public.automation_mark_run(uuid, text, text, text, text);

create or replace function public.automation_mark_run(
  p_id uuid,
  p_status text,
  p_delivery text default '',
  p_error text default '',
  p_preview text default '',
  p_scheduled text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.automation_runs
  set status = p_status,
      delivery_status = coalesce(p_delivery, ''),
      error_text = coalesce(p_error, ''),
      rendered_preview = case when coalesce(p_preview, '') <> '' then p_preview else rendered_preview end,
      scheduled_for = case
        when coalesce(p_scheduled, '') <> '' then p_scheduled::timestamptz
        else scheduled_for
      end,
      updated_at = now()
  where id = p_id;
  if p_status in ('sent', 'failed', 'waiting_reply') then
    update public.automations
    set last_fired_at = now(), updated_at = now()
    where id = (select automation_id from public.automation_runs where id = p_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.automation_mark_run(uuid, text, text, text, text, text) from public;
grant execute on function public.automation_mark_run(uuid, text, text, text, text, text) to anon, authenticated;

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
      where r.status in ('scheduled', 'waiting_reply')
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

create or replace function public.automation_claim_wait(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  update public.automation_runs
  set status = 'running', updated_at = now()
  where id = p_id
    and status = 'waiting_reply'
    and dry_run = false
  returning id into updated_id;
  if updated_id is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.automation_claim_wait(uuid) from public;
grant execute on function public.automation_claim_wait(uuid) to anon, authenticated;

create or replace function public.automation_waiting_replies(p_company_id uuid, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when length(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)) < 10 then '[]'::jsonb
    else coalesce(
      (
        select jsonb_agg(item)
        from (
          select to_jsonb(r) || jsonb_build_object(
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
          ) as item
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
          where r.company_id = p_company_id
            and r.status = 'waiting_reply'
            and r.dry_run = false
            and a.enabled = true
            and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10)
              = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
          order by r.created_at desc
          limit 1
        ) newest
      ),
      '[]'::jsonb
    )
  end;
$$;

revoke all on function public.automation_waiting_replies(uuid, text) from public;
grant execute on function public.automation_waiting_replies(uuid, text) to anon, authenticated;

insert into public.automation_templates (
  slug, name, description, trigger_kind, trigger_config, conditions, actions,
  requires_confirmation, once_per_job, sort_order
) values
(
  'yes-no-new-lead',
  'Ask a new lead yes or no',
  'Text a new lead. Yes creates a call task, no adds a note, and silence after a day creates a follow-up.',
  'lead_created',
  '{"workflow":{"enabled":true,"timeoutHours":24,"yes":[{"id":"y1","kind":"create_task","title":"They said yes — call {{contactName}}","dueInDays":0}],"no":[{"id":"n1","kind":"add_note","body":"{{contactName}} said no."}],"timeout":[{"id":"w1","kind":"create_task","title":"No reply from {{contactName}} — follow up","dueInDays":0}]}}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}}, this is {{companyName}}. Are you looking for a roof estimate? Reply YES or NO."}]'::jsonb,
  true,
  true,
  100
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
