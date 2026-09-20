-- Task desk: notes plus one due-date reminder per open task.

alter table public.tasks
  add column if not exists notes text not null default '',
  add column if not exists reminded_at timestamptz;

create index if not exists tasks_company_due_remind_idx
  on public.tasks (company_id, completed, due_at)
  where reminded_at is null;

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
    t.assignee,
    coalesce(t.notes, ''),
    t.related_type,
    t.related_id,
    nullif(trim(tm.email), ''),
    coalesce(nullif(trim(tm.name), ''), t.assignee),
    coalesce(c.name, ''),
    coalesce(nullif(trim(c.email), ''), '')
  from public.tasks t
  join public.companies c on c.id = t.company_id
  join public.team_members tm
    on tm.company_id = t.company_id
   and not tm.locked
   and lower(trim(tm.name)) = lower(trim(t.assignee))
  where t.completed = false
    and t.due_at <= (timezone('utc', now()))::date
    and t.reminded_at is null
    and coalesce(trim(t.assignee), '') <> ''
    and coalesce(trim(tm.email), '') <> '';
$$;

create or replace function public.mark_task_reminded(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_task_id is null then
    return;
  end if;
  update public.tasks
  set reminded_at = now()
  where id = p_task_id
    and reminded_at is null;
end;
$$;

revoke all on function public.due_task_reminders() from public;
grant execute on function public.due_task_reminders() to anon, authenticated;
revoke all on function public.mark_task_reminded(uuid) from public;
grant execute on function public.mark_task_reminded(uuid) to anon, authenticated;
