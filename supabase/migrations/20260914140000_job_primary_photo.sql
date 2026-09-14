-- Primary project photo: stable cover for the job header / front of the project page.
alter table public.jobs
  add column if not exists primary_photo_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_primary_photo_id_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_primary_photo_id_fkey
      foreign key (primary_photo_id)
      references public.job_photos (id)
      on delete set null;
  end if;
end $$;

create index if not exists jobs_primary_photo_id_idx
  on public.jobs (primary_photo_id)
  where primary_photo_id is not null;

comment on column public.jobs.primary_photo_id is
  'Job photo shown as the project header / front-page cover. Null falls back to the newest live photo.';
