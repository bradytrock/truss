-- Add Supplementing as a pipeline stage between Follow-up and Job Sold.
-- Existing databases skip CREATE TYPE in bootstrap, so this ALTER is required.

alter type public.pipeline_stage add value if not exists 'supplementing';
