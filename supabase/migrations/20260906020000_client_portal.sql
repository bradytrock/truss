-- Client portal: invite homeowners to see schedule, trades, estimates, invoices,
-- and submit referrals for a future rewards program.

create table if not exists public.portal_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  token text not null,
  expires_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists portal_invites_token_key on public.portal_invites (token);
create index if not exists portal_invites_company_contact_idx
  on public.portal_invites (company_id, contact_id)
  where revoked_at is null;
create index if not exists portal_invites_job_idx on public.portal_invites (job_id);

alter table public.portal_invites enable row level security;

drop policy if exists "company isolation" on public.portal_invites;
create policy "company isolation" on public.portal_invites
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Referral submissions. Points / rewards catalog comes later; we store the ask now.
create table if not exists public.portal_referrals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  portal_invite_id uuid references public.portal_invites (id) on delete set null,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  referred_name text not null default '',
  referred_phone text not null default '',
  referred_email text not null default '',
  notes text not null default '',
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewed', 'qualified', 'declined')),
  points_awarded integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists portal_referrals_company_idx on public.portal_referrals (company_id, created_at desc);
create index if not exists portal_referrals_contact_idx on public.portal_referrals (contact_id);

alter table public.portal_referrals enable row level security;

drop policy if exists "company isolation" on public.portal_referrals;
create policy "company isolation" on public.portal_referrals
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create or replace function public.portal_invite_is_active(inv public.portal_invites)
returns boolean
language sql
stable
as $$
  select inv.revoked_at is null and inv.expires_at > now();
$$;

create or replace function public.portal_jobs_for_contact(p_company_id uuid, p_contact_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(j.id order by j.start_date desc nulls last, j.created_at desc), '{}'::uuid[])
  from public.jobs j
  where j.company_id = p_company_id
    and j.deleted_at is null
    and (
      j.primary_contact_id = p_contact_id
      or p_contact_id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
      or exists (
        select 1 from public.contacts c
        where c.id = p_contact_id
          and c.client_id is not null
          and c.client_id = j.client_id
      )
    );
$$;

create or replace function public.shared_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.portal_invites%rowtype;
  company public.companies%rowtype;
  contact public.contacts%rowtype;
  v_token text;
  v_job_ids uuid[];
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);

  select * into inv
  from public.portal_invites
  where token = v_token
  limit 1;
  if not found then
    return null;
  end if;
  if not public.portal_invite_is_active(inv) then
    return null;
  end if;

  update public.portal_invites
  set last_opened_at = now()
  where id = inv.id;

  select * into company from public.companies where id = inv.company_id;
  select * into contact from public.contacts where id = inv.contact_id;
  if company.id is null or contact.id is null then
    return null;
  end if;

  v_job_ids := public.portal_jobs_for_contact(inv.company_id, inv.contact_id);
  if inv.job_id is not null and not (inv.job_id = any (v_job_ids)) then
    v_job_ids := array_prepend(inv.job_id, v_job_ids);
  end if;

  return jsonb_build_object(
    'token', inv.token,
    'expiresAt', inv.expires_at,
    'company', jsonb_build_object(
      'name', coalesce(company.name, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'logoUrl', coalesce(company.logo_url, '')
    ),
    'contact', jsonb_build_object(
      'id', contact.id,
      'name', coalesce(contact.name, 'Homeowner'),
      'email', coalesce(contact.email, ''),
      'phone', coalesce(contact.phone, '')
    ),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'code', j.code,
        'name', j.name,
        'status', j.status,
        'location', coalesce(nullif(trim(both ', ' from concat_ws(', ',
          nullif(j.street, ''), nullif(j.city, ''), nullif(j.state, '')
        )), ''), j.location),
        'startDate', j.start_date,
        'projectManager', coalesce(j.project_manager, ''),
        'superintendent', coalesce(j.superintendent, ''),
        'salesRep', coalesce(j.sales_rep, ''),
        'assigned', to_jsonb(coalesce(j.assigned, '{}'::text[])),
        'trades', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'title', coalesce(t.title, ''),
            'phone', coalesce(t.phone, ''),
            'email', coalesce(t.email, '')
          ) order by t.name)
          from public.contacts t
          where t.id = any (coalesce(j.subcontractor_ids, '{}'::uuid[]))
        ), '[]'::jsonb),
        'schedule', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'kind', e.kind,
            'startsAt', e.starts_at,
            'endsAt', e.ends_at,
            'location', coalesce(e.location, ''),
            'assignee', coalesce(e.assignee, ''),
            'notes', coalesce(e.notes, '')
          ) order by e.starts_at)
          from public.schedule_events e
          where e.job_id = j.id
            and e.company_id = inv.company_id
            and e.starts_at >= (now() - interval '14 days')
        ), '[]'::jsonb)
      ) order by j.start_date desc nulls last, j.created_at desc)
      from public.jobs j
      where j.id = any (v_job_ids)
        and j.company_id = inv.company_id
        and j.deleted_at is null
    ), '[]'::jsonb),
    'estimates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', est.id,
        'number', est.number,
        'name', est.name,
        'status', est.status,
        'jobId', est.job_id,
        'validUntil', est.valid_until,
        'shareToken', coalesce(est.share_token, ''),
        'sharePath', case
          when coalesce(est.share_token, '') <> '' then '/share/e/' || est.share_token
          else null
        end
      ) order by est.created_at desc)
      from public.estimates est
      where est.company_id = inv.company_id
        and est.status in ('sent', 'viewed', 'accepted')
        and (
          est.contact_id = inv.contact_id
          or est.second_contact_id = inv.contact_id
          or est.job_id = any (v_job_ids)
        )
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invc.id,
        'number', invc.number,
        'name', invc.name,
        'status', invc.status,
        'jobId', invc.job_id,
        'issuedAt', invc.issued_at,
        'dueAt', invc.due_at,
        'shareToken', coalesce(invc.share_token, ''),
        'sharePath', case
          when coalesce(invc.share_token, '') <> '' then '/share/i/' || invc.share_token
          else null
        end
      ) order by invc.issued_at desc)
      from public.invoices invc
      where invc.company_id = inv.company_id
        and invc.status in ('sent', 'partial', 'paid', 'overdue')
        and invc.job_id = any (v_job_ids)
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'referredName', r.referred_name,
        'status', r.status,
        'pointsAwarded', r.points_awarded,
        'createdAt', r.created_at
      ) order by r.created_at desc)
      from public.portal_referrals r
      where r.contact_id = inv.contact_id
        and r.company_id = inv.company_id
    ), '[]'::jsonb),
    'rewards', jsonb_build_object(
      'enabled', false,
      'pointsBalance', coalesce((
        select sum(r.points_awarded)::int
        from public.portal_referrals r
        where r.contact_id = inv.contact_id
          and r.company_id = inv.company_id
      ), 0),
      'comingSoon', jsonb_build_array(
        'Roof maintenance visit',
        'Complimentary home soft wash',
        'Gift card'
      )
    )
  );
end;
$$;

create or replace function public.submit_portal_referral(
  p_token text,
  p_referred_name text,
  p_referred_phone text default '',
  p_referred_email text default '',
  p_notes text default '',
  p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.portal_invites%rowtype;
  v_token text;
  v_name text;
  v_job_id uuid;
  v_job_ids uuid[];
  v_contact_name text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  v_token := trim(p_token);
  v_name := trim(coalesce(p_referred_name, ''));
  if length(v_name) < 2 then
    raise exception 'Referral name is required';
  end if;

  select * into inv
  from public.portal_invites
  where token = v_token
  limit 1;
  if not found or not public.portal_invite_is_active(inv) then
    return null;
  end if;

  v_job_ids := public.portal_jobs_for_contact(inv.company_id, inv.contact_id);
  v_job_id := coalesce(p_job_id, inv.job_id);
  if v_job_id is not null
     and not (v_job_id = any (v_job_ids))
     and (inv.job_id is distinct from v_job_id) then
    v_job_id := inv.job_id;
  end if;

  insert into public.portal_referrals (
    company_id,
    portal_invite_id,
    contact_id,
    job_id,
    referred_name,
    referred_phone,
    referred_email,
    notes
  ) values (
    inv.company_id,
    inv.id,
    inv.contact_id,
    v_job_id,
    v_name,
    trim(coalesce(p_referred_phone, '')),
    trim(coalesce(p_referred_email, '')),
    trim(coalesce(p_notes, ''))
  );

  select coalesce(name, 'Homeowner') into v_contact_name
  from public.contacts
  where id = inv.contact_id;

  if v_job_id is not null then
    insert into public.activities (
      company_id,
      entity_type,
      entity_id,
      type,
      body,
      author
    ) values (
      inv.company_id,
      'job',
      v_job_id,
      'note',
      format(
        'Client portal referral from %s: %s%s%s',
        v_contact_name,
        v_name,
        case when trim(coalesce(p_referred_phone, '')) <> '' then ' · ' || trim(p_referred_phone) else '' end,
        case when trim(coalesce(p_notes, '')) <> '' then ' — ' || trim(p_notes) else '' end
      ),
      'Client portal'
    );
  end if;

  return public.shared_portal(v_token);
end;
$$;

revoke all on function public.portal_invite_is_active(public.portal_invites) from public;
revoke all on function public.portal_jobs_for_contact(uuid, uuid) from public;
revoke all on function public.shared_portal(text) from public;
grant execute on function public.shared_portal(text) to anon, authenticated;
revoke all on function public.submit_portal_referral(text, text, text, text, text, uuid) from public;
grant execute on function public.submit_portal_referral(text, text, text, text, text, uuid) to anon, authenticated;
