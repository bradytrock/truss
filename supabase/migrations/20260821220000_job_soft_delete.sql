-- Company admins can move a job to Deleted with a required reason.
-- The row stays so it can be restored. Activity type "audit" is the trail.

alter table public.jobs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text not null default '',
  add column if not exists deleted_by text not null default '';

create index if not exists jobs_company_deleted_idx
  on public.jobs (company_id, deleted_at);

alter type public.activity_type add value if not exists 'audit';
