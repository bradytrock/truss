-- Client share links for Pages (photo reports sent as job documents).

alter table public.photo_reports
  add column if not exists share_token text not null default '',
  add column if not exists template text not null default 'photos';

update public.photo_reports
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token = '';

create unique index if not exists photo_reports_share_token_idx
  on public.photo_reports (share_token)
  where share_token <> '';

create or replace function public.shared_page(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.photo_reports%rowtype;
  job public.jobs%rowtype;
  company public.companies%rowtype;
  contact_name text;
begin
  if p_token is null or length(trim(p_token)) < 6 then
    return null;
  end if;
  select * into report
  from public.photo_reports
  where share_token = trim(p_token)
  limit 1;
  if not found then
    return null;
  end if;
  select * into job from public.jobs where id = report.job_id;
  if not found then
    return null;
  end if;
  select * into company from public.companies where id = report.company_id;
  select name into contact_name from public.contacts where id = job.primary_contact_id;
  return jsonb_build_object(
    'customer', coalesce(contact_name, 'Homeowner'),
    'company', jsonb_build_object(
      'name', coalesce(company.name, ''),
      'phone', coalesce(company.phone, ''),
      'email', coalesce(company.email, ''),
      'website', coalesce(company.website, ''),
      'street', coalesce(company.street, ''),
      'city', coalesce(company.city, ''),
      'state', coalesce(company.state, ''),
      'postalCode', coalesce(company.postal_code, ''),
      'licenseNumber', coalesce(company.license_number, ''),
      'logoUrl', coalesce(company.logo_url, '')
    ),
    'report', jsonb_build_object(
      'id', report.id,
      'jobId', report.job_id,
      'title', report.title,
      'pages', report.pages,
      'template', coalesce(nullif(report.template, ''), 'photos'),
      'shareToken', report.share_token,
      'createdAt', report.created_at,
      'updatedAt', report.updated_at,
      'createdBy', report.created_by
    ),
    'job', jsonb_build_object(
      'id', job.id,
      'code', job.code,
      'name', job.name,
      'clientId', job.client_id,
      'opportunityId', job.opportunity_id,
      'primaryContactId', job.primary_contact_id,
      'relatedContactIds', to_jsonb(coalesce(job.related_contact_ids, '{}'::uuid[])),
      'ownerStaffId', job.owner_staff_id,
      'projectManager', job.project_manager,
      'projectType', job.project_type,
      'street', job.street,
      'city', job.city,
      'state', job.state,
      'postalCode', job.postal_code,
      'location', job.location,
      'customFields', coalesce(job.custom_fields, '[]'::jsonb)
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', photo.id,
        'jobId', photo.job_id,
        'caption', photo.caption,
        'category', photo.category,
        'takenAt', photo.taken_at,
        'imageUrl', photo.image_url,
        'storagePath', photo.storage_path,
        'createdBy', photo.created_by
      ) order by photo.taken_at)
      from public.job_photos photo
      where photo.job_id = job.id
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'title', c.title,
        'phone', c.phone
      ))
      from public.contacts c
      where c.id = job.primary_contact_id
         or c.id = any (coalesce(job.related_contact_ids, '{}'::uuid[]))
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'title', m.title
      ))
      from public.team_members m
      where m.company_id = report.company_id
        and (
          m.name = report.created_by
          or m.id = job.owner_staff_id
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shared_page(text) from public;
grant execute on function public.shared_page(text) to anon, authenticated;
