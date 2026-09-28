-- Opening a job from another project manager's book notifies company admins.
-- It does not ask that project manager to take or decline.
--
-- notified — company admins were told; dismissible

alter table public.returning_client_leads
  drop constraint if exists returning_client_leads_status_check;

alter table public.returning_client_leads
  add constraint returning_client_leads_status_check
    check (status in ('assigned', 'offered', 'pending', 'notified', 'reassigned', 'kept', 'dismissed'));

notify pgrst, 'reload schema';
