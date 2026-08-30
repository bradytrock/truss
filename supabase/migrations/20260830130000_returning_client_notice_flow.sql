-- Ask the previous project manager first when a returning client calls.
-- Company admins decide only after that PM declines, or when the seat is locked.
--
-- assigned  — lead went to the previous PM (FYI, dismissible)
-- offered   — waiting on that PM to take or decline
-- pending   — waiting on a company admin
-- reassigned / kept / dismissed — closed

alter table public.returning_client_leads
  drop constraint if exists returning_client_leads_status_check;

alter table public.returning_client_leads
  add constraint returning_client_leads_status_check
    check (status in ('assigned', 'offered', 'pending', 'reassigned', 'kept', 'dismissed'));

notify pgrst, 'reload schema';
