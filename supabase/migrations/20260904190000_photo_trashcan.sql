-- Project photo trashcan: soft-delete only. Never remove B2 objects from the app.
-- Safe to re-run.

alter table public.job_photos
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by text not null default '';

create index if not exists job_photos_job_deleted_idx
  on public.job_photos (job_id, deleted_at);

create index if not exists job_photos_company_deleted_idx
  on public.job_photos (company_id, deleted_at);

-- Structured audit trail for every trash / restore (and future purge if ever added).
create table if not exists public.photo_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid null references public.jobs (id) on delete set null,
  photo_id uuid not null,
  action text not null,
  actor text not null default '',
  actor_staff_id uuid null,
  caption text not null default '',
  category text not null default '',
  image_url text not null default '',
  storage_path text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now(),
  constraint photo_audit_events_action_check
    check (action in ('deleted', 'restored'))
);

create index if not exists photo_audit_events_job_created_idx
  on public.photo_audit_events (job_id, created_at desc);

create index if not exists photo_audit_events_photo_created_idx
  on public.photo_audit_events (photo_id, created_at desc);

create index if not exists photo_audit_events_company_created_idx
  on public.photo_audit_events (company_id, created_at desc);

alter table public.photo_audit_events enable row level security;

drop policy if exists "company isolation" on public.photo_audit_events;
create policy "company isolation" on public.photo_audit_events
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

grant select, insert on table public.photo_audit_events to authenticated;
-- No update/delete grants: audit rows are append-only from the app.

do $$
begin
  execute 'alter publication supabase_realtime add table public.photo_audit_events';
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
