-- One task can be assigned to several people.
-- Open review copies (one row per person) fold into that shared task.

alter table public.tasks
  add column if not exists assignees text[] not null default '{}';

update public.tasks
set assignees = array[btrim(assignee)]
where coalesce(cardinality(assignees), 0) = 0
  and btrim(coalesce(assignee, '')) <> ''
  and position(' | ' in assignee) = 0;

update public.tasks
set assignees = (
  select coalesce(array_agg(btrim(part) order by ord), '{}')
  from unnest(string_to_array(assignee, ' | ')) with ordinality as piece(part, ord)
  where btrim(part) <> ''
)
where coalesce(cardinality(assignees), 0) = 0
  and position(' | ' in coalesce(assignee, '')) > 0;

update public.tasks
set assignee = assignees[1]
where coalesce(cardinality(assignees), 0) > 0
  and position(' | ' in coalesce(assignee, '')) > 0;

do $$
declare
  rec record;
  keep uuid;
  people text[];
begin
  for rec in
    select company_id, related_id, title
    from public.tasks
    where completed = false
      and related_id is not null
      and (
        (related_type = 'job' and title like 'Review job code %')
        or title like 'Review closeout %'
        or title like 'Review refund %'
      )
    group by company_id, related_id, title
    having count(*) > 1
  loop
    select id into keep
    from public.tasks
    where company_id = rec.company_id
      and related_id = rec.related_id
      and title = rec.title
      and completed = false
    order by created_at, id
    limit 1;

    select coalesce(array_agg(name order by name), '{}')
      into people
    from (
      select distinct btrim(person) as name
      from public.tasks t
      cross join lateral unnest(
        case
          when coalesce(cardinality(t.assignees), 0) > 0 then t.assignees
          when btrim(coalesce(t.assignee, '')) <> '' then array[t.assignee]
          else array[]::text[]
        end
      ) as person
      where t.company_id = rec.company_id
        and t.related_id = rec.related_id
        and t.title = rec.title
        and t.completed = false
        and btrim(person) <> ''
    ) names;

    update public.tasks
    set
      assignees = people,
      assignee = coalesce(people[1], assignee)
    where id = keep;

    delete from public.tasks
    where company_id = rec.company_id
      and related_id = rec.related_id
      and title = rec.title
      and completed = false
      and id <> keep;
  end loop;
end $$;

create or replace function public.due_task_reminders()
returns table (
  task_id uuid,
  company_id uuid,
  title text,
  due_at date,
  assignee text,
  notes text,
  related_type public.entity_kind,
  related_id uuid,
  assignee_email text,
  assignee_name text,
  company_name text,
  company_email text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.company_id,
    t.title,
    t.due_at,
    person.name,
    coalesce(t.notes, ''),
    t.related_type,
    t.related_id,
    nullif(trim(tm.email), ''),
    coalesce(nullif(trim(tm.name), ''), person.name),
    coalesce(c.name, ''),
    coalesce(nullif(trim(c.email), ''), '')
  from public.tasks t
  join public.companies c on c.id = t.company_id
  cross join lateral (
    select btrim(raw_name) as name
    from unnest(
      case
        when coalesce(cardinality(t.assignees), 0) > 0 then t.assignees
        when position(' | ' in coalesce(t.assignee, '')) > 0 then string_to_array(t.assignee, ' | ')
        when btrim(coalesce(t.assignee, '')) <> '' then array[t.assignee]
        else array[]::text[]
      end
    ) as raw_name
    where btrim(raw_name) <> ''
  ) person
  join public.team_members tm
    on tm.company_id = t.company_id
   and not tm.locked
   and lower(trim(tm.name)) = lower(person.name)
  where t.completed = false
    and t.due_at <= (timezone('utc', now()))::date
    and t.reminded_at is null
    and coalesce(trim(tm.email), '') <> '';
$$;

revoke all on function public.due_task_reminders() from public;
grant execute on function public.due_task_reminders() to anon, authenticated;

notify pgrst, 'reload schema';
