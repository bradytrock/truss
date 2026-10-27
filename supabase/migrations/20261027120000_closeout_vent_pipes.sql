-- Vent-pipe photos chosen when a project manager first submits a closeout.
-- Accounting marks them compliant before payout can be released.

alter table public.commission_closeouts
  add column if not exists vent_photo_ids jsonb not null default '[]'::jsonb,
  add column if not exists vent_note text not null default '',
  add column if not exists vent_compliant boolean not null default false;

notify pgrst, 'reload schema';
