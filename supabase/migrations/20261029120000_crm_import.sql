-- HubSpot (and other CRM) imports.
--
-- Imported leads and jobs keep their original create date, remember where they
-- came from (external_source + external_id) so a second upload updates instead
-- of duplicating, and carry imported_at so the automations cron never treats
-- them as fresh leads: no call tasks, no next-day texts, no owner pings.

alter table public.opportunities
  add column if not exists imported_at timestamptz,
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.jobs
  add column if not exists imported_at timestamptz,
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.contacts
  add column if not exists imported_at timestamptz,
  add column if not exists external_source text;

create unique index if not exists opportunities_external_id_key
  on public.opportunities (company_id, external_source, external_id)
  where external_source is not null and external_id is not null;

create unique index if not exists jobs_external_id_key
  on public.jobs (company_id, external_source, external_id)
  where external_source is not null and external_id is not null;

create index if not exists opportunities_imported_at_idx
  on public.opportunities (company_id, imported_at)
  where imported_at is not null;

-- Same function as 20261001120000_automation_lead_triggers.sql, plus the
-- imported_at guard on the lead_created / lead_created_after_days branch.
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
          -- Deals brought over from another CRM are history, not new leads.
          and o.imported_at is null
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
