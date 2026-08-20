-- Who sourced the lead stays on the record when it is assigned to production.

alter table public.opportunities
  add column if not exists originator_staff_id uuid references public.team_members (id) on delete set null;

update public.opportunities
set originator_staff_id = owner_staff_id
where originator_staff_id is null
  and owner_staff_id is not null;

create index if not exists opportunities_originator_staff_id_idx
  on public.opportunities (originator_staff_id);
