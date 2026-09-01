-- Company default email signature plus a per-seat override.
-- Safe to re-run.

alter table public.companies
  add column if not exists default_email_signature text not null default '';

alter table public.team_members
  add column if not exists email_signature text not null default '';

notify pgrst, 'reload schema';
