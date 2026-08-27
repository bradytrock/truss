-- Who was @mentioned on an invoice / expense / payment review comment.
-- Accounting tags the project manager; they get a home notification and
-- reply on the file inside the job record.

alter table public.qb_review_comments
  add column if not exists mentioned_staff_ids text[] not null default '{}';

create index if not exists qb_review_comments_mentions_idx
  on public.qb_review_comments using gin (mentioned_staff_ids);
