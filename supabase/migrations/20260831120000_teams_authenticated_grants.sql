-- Company admins create crews in Settings. Authenticated seats already
-- isolate rows by company_id; this grant is what the Data API needs to write.

revoke all on public.teams from anon, public;
grant select, insert, update, delete on public.teams to authenticated;

notify pgrst, 'reload schema';
