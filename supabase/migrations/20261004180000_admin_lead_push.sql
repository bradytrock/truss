-- Shared lead-alert contract for web and iOS.
-- Apply this file once. Do not recreate these tables in the mobile repo.
--
-- leads.assigned_to and leads.passed_back_by are profiles.id (auth.uid()).
-- leads.status is 'unassigned' or 'assigned'.
-- lead_activity.kind for a rep's note to the company admin is 'rep_note'.
--
-- Realtime (one channel per user, replica identity full on leads):
--   everyone: postgres_changes insert+update on leads, filter assigned_to=eq.{me}
--     updates alert only when old.assigned_to is present and different from me
--   company_admin also: insert+update on leads, filter status=eq.unassigned
--     updates skip when old.status is already unassigned
--   company_admin also: insert on lead_activity, filter kind=eq.rep_note
--     skip notes the admin wrote; fetch the lead before showing the alert
-- Display columns on leads (homeowner_name, street, city, service_type, source,
-- phone, opportunity_id, job_id) are part of the contract. Realtime payloads
-- must be enough to render an alert, and job_id opens the job.
--
-- Phone push:
--   * device_tokens stores APNs (platform = 'ios') and later web-push tokens.
--   * Pass-backs and rep notes insert admin_push_outbox and, when configured,
--     POST the notify-admins Edge Function.
--   * Set these database settings (same secret as the function's NOTIFY_ADMINS_SECRET):
--       alter database postgres set app.settings.notify_admins_url
--         = 'https://<project-ref>.supabase.co/functions/v1/notify-admins';
--       alter database postgres set app.settings.notify_admins_secret = '<secret>';
--   * Or point a Database Webhook at INSERT on admin_push_outbox with header
--     x-notify-secret. The function also accepts the service-role bearer.
--   * APNs env on the function: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID,
--     APNS_PRIVATE_KEY, APNS_ENV (sandbox | production).
-- Web Push for a closed browser tab is intentionally not implemented yet.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  status text not null default 'unassigned',
  assigned_to uuid references public.profiles (id) on delete set null,
  passed_back_by uuid references public.profiles (id) on delete set null,
  passed_back_by_name text,
  passback_reason text,
  handoff_note text,
  homeowner_name text not null default '',
  street text not null default '',
  city text not null default '',
  service_type text not null default '',
  source text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_status_check check (status in ('unassigned', 'assigned')),
  constraint leads_assignment_check check (
    (status = 'assigned' and assigned_to is not null)
    or (status = 'unassigned' and assigned_to is null)
  )
);

create unique index if not exists leads_opportunity_id_uidx
  on public.leads (opportunity_id)
  where opportunity_id is not null;

create index if not exists leads_assigned_to_idx
  on public.leads (assigned_to)
  where assigned_to is not null;

create index if not exists leads_company_status_idx
  on public.leads (company_id, status);

create index if not exists leads_company_updated_idx
  on public.leads (company_id, updated_at desc);

create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint lead_activity_kind_check check (kind in ('rep_note'))
);

-- A previous draft of this table may exist without the rep who wrote the note.
-- CREATE TABLE IF NOT EXISTS does not add columns, so the index and policies
-- below would fail with: column "user_id" does not exist.
alter table public.lead_activity
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

do $$
begin
  if not exists (select 1 from public.lead_activity where user_id is null) then
    alter table public.lead_activity alter column user_id set not null;
  end if;
end $$;

create index if not exists lead_activity_lead_id_idx
  on public.lead_activity (lead_id, created_at desc);

create index if not exists lead_activity_kind_created_idx
  on public.lead_activity (kind, created_at desc);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_tokens_platform_check check (platform in ('ios', 'web')),
  constraint device_tokens_user_token_uidx unique (user_id, token)
);

alter table public.device_tokens
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

do $$
begin
  if not exists (select 1 from public.device_tokens where user_id is null) then
    alter table public.device_tokens alter column user_id set not null;
  end if;
end $$;

create unique index if not exists device_tokens_user_token_uidx
  on public.device_tokens (user_id, token);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);
create index if not exists device_tokens_company_idx on public.device_tokens (company_id);

create table if not exists public.admin_push_outbox (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists admin_push_outbox_unsent_idx
  on public.admin_push_outbox (created_at)
  where sent_at is null;

alter table public.leads replica identity full;
alter table public.lead_activity replica identity full;

create or replace function public.leads_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.assigned_to is not null
    and old.passed_back_by is not null
    and new.assigned_to = old.passed_back_by then
    raise exception 'cannot assign a lead back to the rep who passed it';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists leads_before_write on public.leads;
create trigger leads_before_write
  before update on public.leads
  for each row execute function public.leads_before_write();

create or replace function public.sync_lead_from_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := '';
  v_homeowner text := coalesce(new.name, '');
  v_profile uuid;
  v_role public.seat_role;
  v_status text;
  v_assigned uuid;
begin
  if new.primary_contact_id is not null then
    select c.name, c.phone
      into v_homeowner, v_phone
    from public.contacts c
    where c.id = new.primary_contact_id;
    v_homeowner := coalesce(nullif(v_homeowner, ''), new.name, '');
    v_phone := coalesce(v_phone, '');
  end if;

  if tg_op = 'INSERT' then
    v_profile := null;
    v_role := null;
    if new.owner_staff_id is not null then
      select p.id, p.role
        into v_profile, v_role
      from public.profiles p
      where p.staff_id = new.owner_staff_id
        and p.role = 'project_manager'
      limit 1;
    end if;
    if v_role = 'project_manager' and v_profile is not null then
      v_status := 'assigned';
      v_assigned := v_profile;
    else
      v_status := 'unassigned';
      v_assigned := null;
    end if;

    insert into public.leads (
      company_id,
      opportunity_id,
      status,
      assigned_to,
      homeowner_name,
      street,
      city,
      service_type,
      source,
      phone
    ) values (
      new.company_id,
      new.id,
      v_status,
      v_assigned,
      v_homeowner,
      coalesce(new.street, ''),
      coalesce(new.city, ''),
      coalesce(new.project_type::text, ''),
      coalesce(new.lead_source, ''),
      v_phone
    )
    on conflict (opportunity_id) where opportunity_id is not null do nothing;
    return new;
  end if;

  update public.leads l
  set homeowner_name = v_homeowner,
      street = coalesce(new.street, ''),
      city = coalesce(new.city, ''),
      service_type = coalesce(new.project_type::text, ''),
      source = coalesce(new.lead_source, ''),
      phone = v_phone
  where l.opportunity_id = new.id
    and (
      l.homeowner_name is distinct from v_homeowner
      or l.street is distinct from coalesce(new.street, '')
      or l.city is distinct from coalesce(new.city, '')
      or l.service_type is distinct from coalesce(new.project_type::text, '')
      or l.source is distinct from coalesce(new.lead_source, '')
      or l.phone is distinct from v_phone
    );
  return new;
end;
$$;

drop trigger if exists opportunities_sync_lead on public.opportunities;
create trigger opportunities_sync_lead
  after insert or update of name, street, city, project_type, lead_source, primary_contact_id
  on public.opportunities
  for each row execute function public.sync_lead_from_opportunity();

create or replace function public.attach_lead_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.opportunity_id is null then
    return new;
  end if;
  update public.leads
  set job_id = new.id
  where opportunity_id = new.opportunity_id
    and job_id is distinct from new.id;
  return new;
end;
$$;

drop trigger if exists jobs_attach_lead on public.jobs;
create trigger jobs_attach_lead
  after insert or update of opportunity_id on public.jobs
  for each row execute function public.attach_lead_job();

create or replace function public.sync_opportunity_owner_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_name text := '';
begin
  if new.opportunity_id is null then
    return new;
  end if;
  if new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  if new.assigned_to is null then
    v_staff := null;
    v_name := '';
  else
    select p.staff_id, p.full_name
      into v_staff, v_name
    from public.profiles p
    where p.id = new.assigned_to;
  end if;

  update public.opportunities
  set owner_staff_id = v_staff
  where id = new.opportunity_id
    and owner_staff_id is distinct from v_staff;

  update public.jobs
  set owner_staff_id = v_staff,
      project_manager = coalesce(nullif(v_name, ''), '')
  where opportunity_id = new.opportunity_id
     or id = new.job_id;

  return new;
end;
$$;

drop trigger if exists leads_sync_opportunity_owner on public.leads;
create trigger leads_sync_opportunity_owner
  after update of assigned_to on public.leads
  for each row execute function public.sync_opportunity_owner_from_lead();

create or replace function public.enqueue_admin_lead_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_event text;
  v_company uuid;
  v_title text;
  v_body text;
  v_author uuid;
  v_lead uuid;
  v_payload jsonb;
  v_outbox uuid;
  v_url text;
  v_secret text;
begin
  if tg_table_name = 'leads' then
    if tg_op <> 'UPDATE' then
      return new;
    end if;
    if new.status is distinct from 'unassigned' or new.passed_back_by is null then
      return new;
    end if;
    if old.status = 'unassigned'
      and old.passed_back_by is not distinct from new.passed_back_by
      and old.passback_reason is not distinct from new.passback_reason
      and old.handoff_note is not distinct from new.handoff_note then
      return new;
    end if;
    v_event := 'passback';
    v_company := new.company_id;
    v_lead := new.id;
    v_author := new.passed_back_by;
    v_title := 'Passed back by ' || coalesce(nullif(new.passed_back_by_name, ''), 'a rep');
    v_body := nullif(
      concat_ws(
        ' · ',
        nullif(new.passback_reason, ''),
        case when nullif(new.handoff_note, '') is null then null else '"' || new.handoff_note || '"' end
      ),
      ''
    );
  elsif tg_table_name = 'lead_activity' then
    if tg_op <> 'INSERT' or new.kind is distinct from 'rep_note' then
      return new;
    end if;
    select l.company_id into v_company from public.leads l where l.id = new.lead_id;
    v_event := 'rep_note';
    v_lead := new.lead_id;
    v_author := new.user_id;
    v_title := 'Note from ' || coalesce(nullif(new.author_name, ''), 'a rep');
    v_body := new.body;
  else
    return new;
  end if;

  v_payload := jsonb_build_object(
    'event', v_event,
    'company_id', v_company,
    'lead_id', v_lead,
    'author_id', v_author,
    'title', v_title,
    'body', coalesce(v_body, ''),
    'activity_id', case when tg_table_name = 'lead_activity' then new.id else null end
  );

  insert into public.admin_push_outbox (event, payload)
  values (v_event, v_payload)
  returning id into v_outbox;
  v_payload := v_payload || jsonb_build_object('outbox_id', v_outbox);

  v_url := nullif(current_setting('app.settings.notify_admins_url', true), '');
  v_secret := nullif(current_setting('app.settings.notify_admins_secret', true), '');
  if v_url is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_strip_nulls(jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', v_secret
      )),
      body := v_payload
    );
  exception
    when undefined_function or invalid_schema_name then
      null;
  end;

  return new;
end;
$$;

drop trigger if exists leads_enqueue_admin_push on public.leads;
create trigger leads_enqueue_admin_push
  after update on public.leads
  for each row execute function public.enqueue_admin_lead_push();

drop trigger if exists lead_activity_enqueue_admin_push on public.lead_activity;
create trigger lead_activity_enqueue_admin_push
  after insert on public.lead_activity
  for each row execute function public.enqueue_admin_lead_push();

revoke all on function public.leads_before_write() from public;
revoke all on function public.sync_lead_from_opportunity() from public;
revoke all on function public.attach_lead_job() from public;
revoke all on function public.sync_opportunity_owner_from_lead() from public;
revoke all on function public.enqueue_admin_lead_push() from public;

alter table public.leads enable row level security;
alter table public.lead_activity enable row level security;
alter table public.device_tokens enable row level security;
alter table public.admin_push_outbox enable row level security;

drop policy if exists "read company leads" on public.leads;
create policy "read company leads" on public.leads
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.current_is_company_admin()
      or assigned_to = auth.uid()
    )
  );

drop policy if exists "insert company leads" on public.leads;
create policy "insert company leads" on public.leads
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and (
      public.current_is_company_admin()
      or assigned_to is null
      or assigned_to = auth.uid()
    )
  );

drop policy if exists "pm updates own lead" on public.leads;
create policy "pm updates own lead" on public.leads
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and assigned_to = auth.uid()
  )
  with check (
    company_id = public.current_company_id()
    and (assigned_to is null or assigned_to = auth.uid())
  );

drop policy if exists "admin updates company leads" on public.leads;
create policy "admin updates company leads" on public.leads
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_is_company_admin()
  )
  with check (
    company_id = public.current_company_id()
    and public.current_is_company_admin()
  );

drop policy if exists "read lead activity" on public.lead_activity;
create policy "read lead activity" on public.lead_activity
  for select to authenticated
  using (
    lead_activity.user_id = auth.uid()
    or (
      public.current_is_company_admin()
      and exists (
        select 1
        from public.leads l
        where l.id = lead_activity.lead_id
          and l.company_id = public.current_company_id()
      )
    )
  );

drop policy if exists "pm inserts rep note" on public.lead_activity;
create policy "pm inserts rep note" on public.lead_activity
  for insert to authenticated
  with check (
    lead_activity.user_id = auth.uid()
    and lead_activity.kind = 'rep_note'
    and exists (
      select 1
      from public.leads l
      where l.id = lead_activity.lead_id
        and l.assigned_to = auth.uid()
        and l.company_id = public.current_company_id()
    )
  );

drop policy if exists "manage own device tokens" on public.device_tokens;
create policy "manage own device tokens" on public.device_tokens
  for all to authenticated
  using (
    device_tokens.user_id = auth.uid()
    and device_tokens.company_id = public.current_company_id()
  )
  with check (
    device_tokens.user_id = auth.uid()
    and device_tokens.company_id = public.current_company_id()
  );

revoke all on public.leads from anon;
revoke all on public.lead_activity from anon;
revoke all on public.device_tokens from anon;
revoke all on public.admin_push_outbox from anon, authenticated;

grant select, insert, update on public.leads to authenticated;
grant select, insert on public.lead_activity to authenticated;
grant select, insert, update, delete on public.device_tokens to authenticated;
grant select, insert, update, delete on public.leads to service_role;
grant select, insert, update, delete on public.lead_activity to service_role;
grant select, insert, update, delete on public.device_tokens to service_role;
grant select, insert, update, delete on public.admin_push_outbox to service_role;

-- Backfill before realtime publication so existing pursuits do not page every admin.
insert into public.leads (
  company_id,
  opportunity_id,
  job_id,
  status,
  assigned_to,
  homeowner_name,
  street,
  city,
  service_type,
  source,
  phone
)
select
  o.company_id,
  o.id,
  j.id,
  case when pm.id is not null then 'assigned' else 'unassigned' end,
  pm.id,
  coalesce(nullif(c.name, ''), o.name, ''),
  coalesce(o.street, ''),
  coalesce(o.city, ''),
  coalesce(o.project_type::text, ''),
  coalesce(o.lead_source, ''),
  coalesce(c.phone, '')
from public.opportunities o
left join lateral (
  select p.id
  from public.profiles p
  where p.staff_id = o.owner_staff_id
    and p.role = 'project_manager'
  limit 1
) pm on true
left join public.contacts c on c.id = o.primary_contact_id
left join lateral (
  select jobs.id
  from public.jobs
  where jobs.opportunity_id = o.id
    and jobs.deleted_at is null
  order by jobs.created_at desc
  limit 1
) j on true
where not exists (
  select 1 from public.leads l where l.opportunity_id = o.id
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.leads;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.lead_activity;
  exception
    when duplicate_object then null;
  end;
end $$;
