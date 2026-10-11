-- Unqualified is a pipeline outcome, separate from Lost and from Deleted.
-- Existing databases skip CREATE TYPE, so this ALTER is required.
-- The new value is committed in this migration before later functions use it.

alter type public.pipeline_stage add value if not exists 'unqualified';
