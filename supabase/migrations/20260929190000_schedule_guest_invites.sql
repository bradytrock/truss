-- Guest emails on a schedule event, plus the Google Calendar event that
-- emails people outside the company.

alter table public.schedule_events
  add column if not exists guest_emails text[] not null default '{}',
  add column if not exists google_event_id text not null default '',
  add column if not exists google_organizer_staff_id uuid references public.team_members (id) on delete set null;

comment on column public.schedule_events.guest_emails is
  'Emails invited to this event. People outside the company are emailed a Google Calendar invite.';
comment on column public.schedule_events.google_event_id is
  'Google Calendar event id for the invite sent to people outside the company. Blank when none was sent.';
comment on column public.schedule_events.google_organizer_staff_id is
  'Seat whose linked Google Calendar owns the invite.';
