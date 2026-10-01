-- Waits between workflow steps. The run stores where it should resume.
-- automation_mark_run can set that cursor and the next deadline.

alter table public.automation_runs
  add column if not exists workflow_cursor jsonb;

drop function if exists public.automation_mark_run(uuid, text, text, text, text);
drop function if exists public.automation_mark_run(uuid, text, text, text, text, text);

create or replace function public.automation_mark_run(
  p_id uuid,
  p_status text,
  p_delivery text default '',
  p_error text default '',
  p_preview text default '',
  p_scheduled text default '',
  p_cursor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.automation_runs
  set status = p_status,
      delivery_status = coalesce(p_delivery, ''),
      error_text = coalesce(p_error, ''),
      rendered_preview = case when coalesce(p_preview, '') <> '' then p_preview else rendered_preview end,
      scheduled_for = case
        when coalesce(p_scheduled, '') <> '' then p_scheduled::timestamptz
        else scheduled_for
      end,
      workflow_cursor = case
        when p_cursor is null then workflow_cursor
        when btrim(p_cursor) = '' then null
        else p_cursor::jsonb
      end,
      updated_at = now()
  where id = p_id;
  if p_status in ('sent', 'failed', 'waiting_reply', 'scheduled') then
    update public.automations
    set last_fired_at = now(), updated_at = now()
    where id = (select automation_id from public.automation_runs where id = p_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.automation_mark_run(uuid, text, text, text, text, text, text) from public;
grant execute on function public.automation_mark_run(uuid, text, text, text, text, text, text) to anon, authenticated;

update public.automation_templates
set trigger_config = '{"workflow":{"enabled":true,"steps":[{"id":"t1","kind":"action","action":{"id":"t1","kind":"send_sms","to":"customer","body":"Hi {{contactName}}, this is {{companyName}}. Are you looking for a roof estimate? Reply YES or NO."}}],"reply":{"amount":24,"unit":"hours","yes":[{"id":"y1","kind":"action","action":{"id":"y1","kind":"create_task","title":"They said yes — call {{contactName}}","dueInDays":0}}],"no":[{"id":"n1","kind":"action","action":{"id":"n1","kind":"add_note","body":"{{contactName}} said no."}}],"timeout":[{"id":"w1","kind":"action","action":{"id":"w1","kind":"create_task","title":"No reply from {{contactName}} — follow up","dueInDays":0}}]}}}'::jsonb
where slug = 'yes-no-new-lead';

notify pgrst, 'reload schema';
