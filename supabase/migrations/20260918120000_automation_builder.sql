-- Tenant-facing When / If / Then automations. Company admins build rules;
-- job owners confirm or skip customer-facing sends.

alter table public.team_members
  add column if not exists manage_automations boolean not null default false;

create or replace function public.current_can_manage_automations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_is_company_admin()
    or (
      select coalesce(tm.manage_automations, false) = true
        and coalesce(tm.locked, false) = false
        and coalesce(tm.restricted, false) = false
      from public.profiles p
      left join public.team_members tm on tm.id = p.staff_id
      where p.id = auth.uid()
    ),
    false
  )
$$;

revoke all on function public.current_can_manage_automations() from public;
grant execute on function public.current_can_manage_automations() to authenticated;

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  trigger_kind text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  requires_confirmation boolean not null default true,
  once_per_job boolean not null default true,
  enabled boolean not null default true,
  created_by_staff_id uuid references public.team_members (id) on delete set null,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automations_company_idx
  on public.automations (company_id, enabled, trigger_kind);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  estimate_id uuid references public.estimates (id) on delete set null,
  event_id uuid,
  status text not null default 'scheduled',
  scheduled_for timestamptz,
  rendered_preview text not null default '',
  delivery_status text not null default '',
  error_text text not null default '',
  confirmed_by_staff_id uuid references public.team_members (id) on delete set null,
  confirmed_by_name text not null default '',
  decided_at timestamptz,
  dry_run boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_runs_company_idx
  on public.automation_runs (company_id, created_at desc);
create index if not exists automation_runs_automation_idx
  on public.automation_runs (automation_id, created_at desc);
create index if not exists automation_runs_job_idx
  on public.automation_runs (job_id, created_at desc);
create index if not exists automation_runs_due_idx
  on public.automation_runs (status, scheduled_for)
  where status = 'scheduled';

create table if not exists public.automation_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  trigger_kind text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  requires_confirmation boolean not null default true,
  once_per_job boolean not null default true,
  sort_order int not null default 0
);

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_templates enable row level security;
alter table public.automations replica identity full;
alter table public.automation_runs replica identity full;

drop policy if exists "company read automations" on public.automations;
create policy "company read automations" on public.automations
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "admin write automations" on public.automations;
create policy "admin write automations" on public.automations
  for all to authenticated
  using (company_id = public.current_company_id() and public.current_can_manage_automations())
  with check (company_id = public.current_company_id() and public.current_can_manage_automations());

drop policy if exists "pause automations" on public.automations;
create policy "pause automations" on public.automations
  for update to authenticated
  using (company_id = public.current_company_id() and public.current_can_manage_automations())
  with check (company_id = public.current_company_id() and public.current_can_manage_automations());

drop policy if exists "company read automation runs" on public.automation_runs;
create policy "company read automation runs" on public.automation_runs
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "company write automation runs" on public.automation_runs;
create policy "company write automation runs" on public.automation_runs
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists "company update automation runs" on public.automation_runs;
create policy "company update automation runs" on public.automation_runs
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "read automation templates" on public.automation_templates;
create policy "read automation templates" on public.automation_templates
  for select to authenticated
  using (true);

grant select, insert, update, delete on public.automations to authenticated;
grant select, insert, update, delete on public.automation_runs to authenticated;
grant select on public.automation_templates to authenticated;

insert into public.automation_templates (
  slug, name, description, trigger_kind, trigger_config, conditions, actions,
  requires_confirmation, once_per_job, sort_order
) values
(
  'review-on-close',
  'Ask for a review when the job closes',
  'When a job moves to Complete, text the homeowner a thank-you and your review link.',
  'job_stage_changed',
  '{"stage":"complete"}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}} — thanks for trusting {{companyName}} with {{jobName}}. If you have a minute, a review helps neighbors find us: {{reviewUrl}}"}]'::jsonb,
  true,
  true,
  10
),
(
  'appointment-reminder',
  'Remind them the day before an appointment',
  'The day before a calendar visit, text the customer so someone is home.',
  'event_in_days',
  '{"days":1}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}}, this is {{staffName}} with {{companyName}}. We are on the calendar for {{jobName}} tomorrow. Text us if you need to move it."}]'::jsonb,
  true,
  false,
  20
),
(
  'thanks-after-payment',
  'Thank-you after a payment',
  'When an invoice is paid, send a short thank-you text.',
  'invoice_paid',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}}, we received your payment. Thank you — {{staffName}} at {{companyName}}."}]'::jsonb,
  true,
  true,
  30
),
(
  'estimate-follow-up',
  'Follow up 3 days after an estimate is sent',
  'If the proposal is still sitting, create a call task and text the customer.',
  'estimate_sent_after_days',
  '{"days":3}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}}, just checking that you had a chance to look at the {{jobName}} proposal. Happy to walk through it — {{staffName}}, {{companyPhone}}."},{"id":"t2","kind":"create_task","title":"Follow up on {{jobCode}} proposal","dueInDays":0}]'::jsonb,
  true,
  true,
  40
),
(
  'notify-lost',
  'Notify the owner when a job is lost',
  'When a job moves to Lost, text the job owner so they can follow up.',
  'job_stage_changed',
  '{"stage":"lost"}'::jsonb,
  '[]'::jsonb,
  '[{"id":"t1","kind":"notify_staff","to":"rep","body":"{{jobCode}} {{jobName}} just moved to Lost."}]'::jsonb,
  false,
  true,
  50
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

do $$
begin
  alter publication supabase_realtime add table public.automations;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.automation_runs;
exception
  when duplicate_object then null;
end $$;

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
        'owner_phone', coalesce(tm.phone, ''),
        'owner_email', coalesce(tm.email, ''),
        'owner_name', coalesce(tm.name, '')
      ))
      from public.automation_runs r
      join public.automations a on a.id = r.automation_id
      left join public.jobs j on j.id = r.job_id
      left join public.contacts c on c.id = j.primary_contact_id
      left join public.team_members tm on tm.id = j.owner_staff_id
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

create or replace function public.automation_mark_run(
  p_id uuid,
  p_status text,
  p_delivery text default '',
  p_error text default '',
  p_preview text default ''
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
      updated_at = now()
  where id = p_id;
  if p_status in ('sent', 'failed') then
    update public.automations
    set last_fired_at = now(), updated_at = now()
    where id = (select automation_id from public.automation_runs where id = p_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.automation_mark_run(uuid, text, text, text, text) from public;
grant execute on function public.automation_mark_run(uuid, text, text, text, text) to anon, authenticated;

create or replace function public.automation_add_task(
  p_company_id uuid,
  p_title text,
  p_job_id uuid default null,
  p_assignee text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tasks (company_id, title, due_at, related_type, related_id, assignee)
  values (
    p_company_id,
    p_title,
    now(),
    case when p_job_id is null then null else 'job' end,
    p_job_id,
    coalesce(p_assignee, '')
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.automation_add_task(uuid, text, uuid, text) from public;
grant execute on function public.automation_add_task(uuid, text, uuid, text) to anon, authenticated;

create or replace function public.automation_upcoming_event_matches()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'automation', to_jsonb(a),
        'company_id', e.company_id,
        'event_id', e.id,
        'job_id', e.job_id,
        'starts_at', e.starts_at,
        'event_title', e.title,
        'contact_phone', coalesce(c.phone, ''),
        'contact_email', coalesce(c.email, ''),
        'contact_name', coalesce(c.name, ''),
        'owner_phone', coalesce(tm.phone, ''),
        'owner_email', coalesce(tm.email, ''),
        'owner_name', coalesce(tm.name, ''),
        'job_name', coalesce(j.name, ''),
        'job_code', coalesce(j.code, ''),
        'job_city', coalesce(j.city, ''),
        'company_name', coalesce(co.name, ''),
        'company_phone', coalesce(co.phone, '')
      ))
      from public.automations a
      join public.schedule_events e on e.company_id = a.company_id
      left join public.jobs j on j.id = e.job_id
      left join public.contacts c on c.id = j.primary_contact_id
      left join public.team_members tm on tm.id = j.owner_staff_id
      left join public.companies co on co.id = a.company_id
      where a.enabled = true
        and a.trigger_kind = 'event_in_days'
        and e.starts_at > now()
        and e.starts_at <= now() + make_interval(days => greatest(coalesce((a.trigger_config->>'days')::int, 1), 1))
        and e.starts_at - make_interval(days => greatest(coalesce((a.trigger_config->>'days')::int, 1), 1)) <= now()
        and not exists (
          select 1
          from public.automation_runs r
          where r.automation_id = a.id
            and r.dry_run = false
            and r.status not in ('skipped', 'failed')
            and (
              r.event_id = e.id
              or (a.once_per_job and e.job_id is not null and r.job_id = e.job_id)
            )
        )
      limit 50
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.automation_upcoming_event_matches() from public;
grant execute on function public.automation_upcoming_event_matches() to anon, authenticated;

create or replace function public.automation_insert_run(p_run jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.automation_runs (
    id, company_id, automation_id, job_id, invoice_id, estimate_id, event_id,
    status, scheduled_for, rendered_preview, delivery_status, error_text, dry_run
  ) values (
    coalesce(nullif(p_run->>'id', '')::uuid, gen_random_uuid()),
    (p_run->>'company_id')::uuid,
    (p_run->>'automation_id')::uuid,
    nullif(p_run->>'job_id', '')::uuid,
    nullif(p_run->>'invoice_id', '')::uuid,
    nullif(p_run->>'estimate_id', '')::uuid,
    nullif(p_run->>'event_id', '')::uuid,
    coalesce(nullif(p_run->>'status', ''), 'scheduled'),
    nullif(p_run->>'scheduled_for', '')::timestamptz,
    coalesce(p_run->>'rendered_preview', ''),
    coalesce(p_run->>'delivery_status', ''),
    coalesce(p_run->>'error_text', ''),
    coalesce((p_run->>'dry_run')::boolean, false)
  )
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

revoke all on function public.automation_insert_run(jsonb) from public;
grant execute on function public.automation_insert_run(jsonb) to anon, authenticated;
