-- New lead, assignment, and appointment automations.
-- Office actions queue immediately. Website chat, missed calls, and other
-- server-side leads are picked up by the hourly automations cron.

insert into public.automation_templates (
  slug, name, description, trigger_kind, trigger_config, conditions, actions,
  requires_confirmation, once_per_job, sort_order
) values
(
  'call-new-lead',
  'Call a new lead',
  'When a lead is opened — in the office, from the website, or from a missed call — add a call task.',
  'lead_created',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"create_task","title":"Call {{contactName}} about {{jobCode}}","dueInDays":0}]'::jsonb,
  false,
  true,
  60
),
(
  'lead-assigned',
  'Text the owner when a lead is assigned',
  'When a lead moves to someone, text that job owner.',
  'lead_assigned',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"notify_staff","to":"rep","body":"{{jobCode}} {{contactName}} is on your book. {{jobCity}}"}]'::jsonb,
  false,
  true,
  70
),
(
  'appointment-booked',
  'Confirm when an appointment is booked',
  'When a visit is put on the calendar, text the customer that it is set.',
  'appointment_scheduled',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}}, this is {{staffName}} with {{companyName}}. You are on the calendar for {{jobName}}. Text us if you need to move it."}]'::jsonb,
  true,
  false,
  80
),
(
  'lead-next-day',
  'Follow up the day after a new lead',
  'One day after a lead is opened, text the customer and add a call task.',
  'lead_created_after_days',
  '{"days":1}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}}, this is {{staffName}} with {{companyName}}. Wanted to make sure we got you the info on {{jobName}}. Call or text {{companyPhone}}."},{"id":"t2","kind":"create_task","title":"Follow up with {{contactName}} on {{jobCode}}","dueInDays":0}]'::jsonb,
  true,
  true,
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

create or replace function public.automation_inbound_matches()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(item)
      from (
        select jsonb_build_object(
          'automation', to_jsonb(a),
          'company_id', o.company_id,
          'job_id', j.id,
          'event_id', '',
          'due_at', case
            when a.trigger_kind = 'lead_created_after_days'
              then o.created_at + make_interval(days => greatest(coalesce((a.trigger_config->>'days')::int, 1), 1))
            else now()
          end,
          'opportunity_id', o.id,
          'opportunity_stage', coalesce(o.stage::text, ''),
          'opportunity_lead_source', coalesce(o.lead_source, ''),
          'contact_phone', coalesce(c.phone, ''),
          'contact_email', coalesce(c.email, ''),
          'contact_name', coalesce(c.name, ''),
          'owner_phone', coalesce(tm.phone, ''),
          'owner_email', coalesce(tm.email, ''),
          'owner_name', coalesce(tm.name, ''),
          'owner_staff_id', coalesce(j.owner_staff_id::text, o.owner_staff_id::text, ''),
          'job_name', coalesce(j.name, o.name, ''),
          'job_code', coalesce(j.code, ''),
          'job_city', coalesce(nullif(j.city, ''), o.city, ''),
          'job_state', coalesce(nullif(j.state, ''), o.state, ''),
          'job_status', coalesce(j.status::text, ''),
          'job_project_type', coalesce(j.project_type::text, o.project_type::text, ''),
          'job_market', coalesce(nullif(j.market, ''), o.market, ''),
          'job_lead_source', coalesce(nullif(j.lead_source, ''), o.lead_source, ''),
          'company_name', coalesce(co.name, ''),
          'company_phone', coalesce(co.phone, '')
        ) as item
        from public.automations a
        join public.opportunities o on o.company_id = a.company_id
        join lateral (
          select *
          from public.jobs j
          where j.opportunity_id = o.id
            and j.deleted_at is null
          order by j.created_at
          limit 1
        ) j on true
        left join public.contacts c on c.id = coalesce(j.primary_contact_id, o.primary_contact_id)
        left join public.team_members tm on tm.id = coalesce(j.owner_staff_id, o.owner_staff_id)
        left join public.companies co on co.id = a.company_id
        where a.enabled = true
          and (
            (
              a.trigger_kind = 'lead_created'
              and o.created_at > now() - interval '6 hours'
            )
            or (
              a.trigger_kind = 'lead_created_after_days'
              and o.created_at + make_interval(days => greatest(coalesce((a.trigger_config->>'days')::int, 1), 1)) <= now()
              and o.created_at + make_interval(days => greatest(coalesce((a.trigger_config->>'days')::int, 1), 1))
                > now() - interval '6 hours'
            )
          )
          and not exists (
            select 1
            from public.automation_runs r
            where r.automation_id = a.id
              and r.job_id = j.id
              and r.dry_run = false
              and r.status not in ('skipped', 'failed')
          )

        union all

        select jsonb_build_object(
          'automation', to_jsonb(a),
          'company_id', e.company_id,
          'job_id', j.id,
          'event_id', e.id,
          'due_at', now(),
          'event_title', coalesce(e.title, ''),
          'opportunity_id', coalesce(e.opportunity_id, j.opportunity_id),
          'opportunity_stage', coalesce(o.stage::text, ''),
          'opportunity_lead_source', coalesce(o.lead_source, ''),
          'contact_phone', coalesce(c.phone, ''),
          'contact_email', coalesce(c.email, ''),
          'contact_name', coalesce(c.name, ''),
          'owner_phone', coalesce(tm.phone, ''),
          'owner_email', coalesce(tm.email, ''),
          'owner_name', coalesce(tm.name, ''),
          'owner_staff_id', coalesce(j.owner_staff_id::text, ''),
          'job_name', coalesce(j.name, e.title, ''),
          'job_code', coalesce(j.code, ''),
          'job_city', coalesce(j.city, ''),
          'job_state', coalesce(j.state, ''),
          'job_status', coalesce(j.status::text, ''),
          'job_project_type', coalesce(j.project_type::text, ''),
          'job_market', coalesce(j.market, ''),
          'job_lead_source', coalesce(j.lead_source, ''),
          'company_name', coalesce(co.name, ''),
          'company_phone', coalesce(co.phone, '')
        ) as item
        from public.automations a
        join public.schedule_events e on e.company_id = a.company_id
        join lateral (
          select *
          from public.jobs j
          where j.deleted_at is null
            and (
              j.id = e.job_id
              or (
                e.job_id is null
                and e.opportunity_id is not null
                and j.opportunity_id = e.opportunity_id
              )
            )
          order by case when j.id = e.job_id then 0 else 1 end, j.created_at
          limit 1
        ) j on true
        left join public.opportunities o on o.id = coalesce(e.opportunity_id, j.opportunity_id)
        left join public.contacts c on c.id = j.primary_contact_id
        left join public.team_members tm on tm.id = j.owner_staff_id
        left join public.companies co on co.id = a.company_id
        where a.enabled = true
          and a.trigger_kind = 'appointment_scheduled'
          and e.created_at > now() - interval '6 hours'
          and not exists (
            select 1
            from public.automation_runs r
            where r.automation_id = a.id
              and r.dry_run = false
              and r.status not in ('skipped', 'failed')
              and (
                r.event_id = e.id
                or (a.once_per_job and r.job_id = j.id)
              )
          )
        limit 50
      ) matches
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.automation_inbound_matches() from public;
grant execute on function public.automation_inbound_matches() to anon, authenticated;

notify pgrst, 'reload schema';
