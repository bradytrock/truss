-- Director seat. Permissions that use the new value live in the next migration:
-- Postgres cannot use an enum value added in the same transaction.

alter type public.seat_role add value if not exists 'director';
