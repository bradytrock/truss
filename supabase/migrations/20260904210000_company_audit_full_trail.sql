-- Widen company audit trail to cover views, opens, moves, uploads, shares, auth, and more entities.
-- Safe to re-run.

alter table public.company_audit_events
  drop constraint if exists company_audit_events_action_check;

alter table public.company_audit_events
  drop constraint if exists company_audit_events_entity_type_check;

alter table public.company_audit_events
  add constraint company_audit_events_action_check
  check (action in (
    'created',
    'updated',
    'deleted',
    'restored',
    'status_changed',
    'reverted',
    'moved',
    'viewed',
    'opened',
    'uploaded',
    'downloaded',
    'shared',
    'assigned',
    'login',
    'logout',
    'seat_switched',
    'impersonated'
  ));

alter table public.company_audit_events
  add constraint company_audit_events_entity_type_check
  check (entity_type in (
    'job',
    'contact',
    'opportunity',
    'photo',
    'job_file',
    'estimate',
    'invoice',
    'company_file',
    'payment',
    'expense',
    'task',
    'schedule_event',
    'message',
    'company_settings',
    'staff',
    'team',
    'session',
    'photo_report'
  ));

notify pgrst, 'reload schema';
