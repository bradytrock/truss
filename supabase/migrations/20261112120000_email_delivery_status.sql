-- Delivery status for emails Resend sends on a job.
-- resend_id lets a webhook or a job-page refresh update email_status in place.

alter table public.activities add column if not exists resend_id text not null default '';
alter table public.activities add column if not exists email_status text not null default '';

create index if not exists activities_resend_id_idx
  on public.activities (resend_id)
  where resend_id <> '';

create or replace function public.log_job_email_activity(
  p_job_id uuid,
  p_body text,
  p_author text,
  p_resend_id text,
  p_email_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_session uuid;
  v_id uuid;
  v_body text := left(trim(coalesce(p_body, '')), 4000);
begin
  if p_job_id is null or v_body = '' then
    return null;
  end if;
  select company_id into v_company from public.jobs where id = p_job_id;
  if v_company is null then
    return null;
  end if;
  select company_id into v_session from public.profiles where id = auth.uid();
  if v_session is not null and v_session <> v_company then
    return null;
  end if;
  insert into public.activities (
    company_id,
    entity_type,
    entity_id,
    type,
    body,
    author,
    resend_id,
    email_status
  )
  values (
    v_company,
    'job',
    p_job_id,
    'email',
    v_body,
    coalesce(nullif(trim(p_author), ''), 'Truss'),
    coalesce(nullif(trim(p_resend_id), ''), ''),
    coalesce(nullif(trim(p_email_status), ''), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_job_email_activity(uuid, text, text, text, text) from public;
grant execute on function public.log_job_email_activity(uuid, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
