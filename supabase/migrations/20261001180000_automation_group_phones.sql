-- Phones for an automation group message: homeowners on the job.
-- A reply from any of those numbers can also resume a waiting workflow.

create or replace function public.automation_job_phones(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(phone)
      from (
        select distinct trim(c.phone) as phone
        from public.jobs j
        join public.contacts c
          on c.company_id = j.company_id
         and (
           c.id = j.primary_contact_id
           or c.id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
         )
        where j.id = p_job_id
          and not (c.id = any (coalesce(j.subcontractor_ids, '{}'::uuid[])))
          and coalesce(c.is_referral_partner, false) = false
          and coalesce(c.title, '') not ilike '%adjuster%'
          and coalesce(trim(c.phone), '') <> ''
      ) people
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.automation_job_phones(uuid) from public;
grant execute on function public.automation_job_phones(uuid) to anon, authenticated;

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
            and (
              right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10)
                = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
              or exists (
                select 1
                from public.contacts member
                where member.company_id = j.company_id
                  and member.id = any (coalesce(j.related_contact_ids, '{}'::uuid[]))
                  and right(regexp_replace(coalesce(member.phone, ''), '\D', '', 'g'), 10)
                    = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
              )
            )
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

notify pgrst, 'reload schema';
