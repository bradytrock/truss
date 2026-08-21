-- Residential vs commercial on leads and jobs. Residential estimates are not taxed.

alter table public.opportunities
  add column if not exists market text not null default 'residential';

alter table public.jobs
  add column if not exists market text not null default 'residential';

update public.opportunities
set market = 'commercial'
where project_type in (
  'commercial',
  'multifamily',
  'healthcare',
  'education',
  'industrial',
  'hospitality',
  'civic',
  'tenant_improvement'
);

update public.jobs j
set market = o.market
from public.opportunities o
where j.opportunity_id = o.id;

update public.jobs
set market = 'commercial'
where project_type in (
  'commercial',
  'multifamily',
  'healthcare',
  'education',
  'industrial',
  'hospitality',
  'civic',
  'tenant_improvement'
);
