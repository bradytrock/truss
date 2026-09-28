-- Estimating and Supplementing are one pipeline column, named Supplementing.
-- The enum value stays so existing rows can be rewritten in place.

update public.opportunities
set stage = 'supplementing'
where stage = 'estimating';
