-- One costing job per lead. Opening a lead and the "fill missing jobs" pass
-- were racing and inserting two cards with the same code.

create temporary table if not exists truss_job_dupes (
  extra_id uuid primary key,
  keep_id uuid not null
);

delete from truss_job_dupes;

insert into truss_job_dupes (extra_id, keep_id)
select extra.id, keeper.keep_id
from public.jobs extra
join (
  select
    opportunity_id,
    (array_agg(id order by contract_value desc, created_at, id))[1] as keep_id
  from public.jobs
  where opportunity_id is not null
  group by opportunity_id
  having count(*) > 1
) keeper on keeper.opportunity_id = extra.opportunity_id
where extra.id <> keeper.keep_id;

update public.estimates e
set job_id = d.keep_id
from truss_job_dupes d
where e.job_id = d.extra_id;

update public.invoices i
set job_id = d.keep_id
from truss_job_dupes d
where i.job_id = d.extra_id;

update public.payments p
set job_id = d.keep_id
from truss_job_dupes d
where p.job_id = d.extra_id;

update public.expenses x
set job_id = d.keep_id
from truss_job_dupes d
where x.job_id = d.extra_id;

update public.schedule_events s
set job_id = d.keep_id
from truss_job_dupes d
where s.job_id = d.extra_id;

update public.job_photos p
set job_id = d.keep_id
from truss_job_dupes d
where p.job_id = d.extra_id;

update public.photo_reports r
set job_id = d.keep_id
from truss_job_dupes d
where r.job_id = d.extra_id;

update public.tasks t
set related_id = d.keep_id
from truss_job_dupes d
where t.related_type = 'job'
  and t.related_id = d.extra_id;

delete from public.jobs
where id in (select extra_id from truss_job_dupes);

drop table if exists truss_job_dupes;

create unique index if not exists jobs_one_per_opportunity_idx
  on public.jobs (opportunity_id)
  where opportunity_id is not null;
