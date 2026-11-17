-- Proposals built on a lead before the costing job existed kept a null job_id,
-- so the job record never listed them. Attach each one to the single live job
-- on that same lead.

update public.estimates as estimate
set job_id = job.id
from public.jobs as job
where estimate.job_id is null
  and estimate.opportunity_id is not null
  and job.opportunity_id = estimate.opportunity_id
  and job.company_id = estimate.company_id
  and job.deleted_at is null
  and (
    select count(*)
    from public.jobs as sibling
    where sibling.company_id = estimate.company_id
      and sibling.opportunity_id = estimate.opportunity_id
      and sibling.deleted_at is null
  ) = 1;
