-- Live calendar_shares was created as owner_id/viewer_id (profiles).
-- The app expects owner_staff_id/viewer_staff_id (team_members). The table is empty.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_shares' and column_name = 'owner_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_shares' and column_name = 'owner_staff_id'
  ) then
    alter table public.calendar_shares drop constraint if exists calendar_shares_not_self;
    alter table public.calendar_shares drop constraint if exists calendar_shares_owner_id_fkey;
    alter table public.calendar_shares drop constraint if exists calendar_shares_viewer_id_fkey;
    alter table public.calendar_shares drop constraint if exists calendar_shares_owner_viewer_uidx;
    alter table public.calendar_shares rename column owner_id to owner_staff_id;
    alter table public.calendar_shares rename column viewer_id to viewer_staff_id;
    alter table public.calendar_shares
      add constraint calendar_shares_owner_staff_id_fkey
        foreign key (owner_staff_id) references public.team_members (id) on delete cascade;
    alter table public.calendar_shares
      add constraint calendar_shares_viewer_staff_id_fkey
        foreign key (viewer_staff_id) references public.team_members (id) on delete cascade;
    alter table public.calendar_shares
      add constraint calendar_shares_owner_viewer_uidx unique (owner_staff_id, viewer_staff_id);
    alter table public.calendar_shares
      add constraint calendar_shares_not_self check (owner_staff_id <> viewer_staff_id);
  end if;
end $$;

notify pgrst, 'reload schema';
