-- Voice intake creates assigned leads outside the signed-in desk.
-- This returns the same assignee + team-lead context the desk notify route uses.

create or replace function public.voice_lead_assign_context(
  p_token text,
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agent public.voice_agents%rowtype;
  opp public.opportunities%rowtype;
  contact_row public.contacts%rowtype;
  company_row public.companies%rowtype;
  owner_row public.team_members%rowtype;
  site text;
begin
  if coalesce(nullif(trim(p_token), ''), '') = '' or p_opportunity_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing lead.');
  end if;

  select * into agent
  from public.voice_agents
  where webhook_token = trim(p_token)
  limit 1;
  if not found or not agent.enabled then
    return jsonb_build_object('ok', false, 'error', 'Unknown or disabled voice agent.');
  end if;

  select * into opp
  from public.opportunities
  where id = p_opportunity_id
    and company_id = agent.company_id
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That lead is gone.');
  end if;

  select * into company_row from public.companies where id = agent.company_id;
  if opp.owner_staff_id is not null then
    select * into owner_row from public.team_members where id = opp.owner_staff_id;
  end if;
  if opp.primary_contact_id is not null then
    select * into contact_row from public.contacts where id = opp.primary_contact_id;
  end if;

  site := trim(both ' ' from concat_ws(', ',
    nullif(trim(coalesce(opp.street, '')), ''),
    nullif(trim(concat_ws(' ', nullif(trim(coalesce(opp.city, '')), ''), nullif(trim(coalesce(opp.state, '')), ''))), ''),
    nullif(trim(coalesce(opp.postal_code, '')), '')
  ));

  return jsonb_build_object(
    'ok', true,
    'companyName', coalesce(company_row.name, ''),
    'companyEmail', coalesce(company_row.email, ''),
    'ownerStaffId', owner_row.id,
    'assignedToName', coalesce(nullif(trim(owner_row.name), ''), opp.estimator, ''),
    'homeownerName', coalesce(contact_row.name, ''),
    'homeownerPhone', coalesce(contact_row.phone, ''),
    'homeownerEmail', coalesce(contact_row.email, ''),
    'propertyAddress', coalesce(nullif(site, ''), nullif(trim(opp.location), ''), 'Address TBD'),
    'notes', coalesce(opp.notes, ''),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tm.id,
        'name', tm.name,
        'email', tm.email,
        'teamId', tm.team_id,
        'role', tm.role,
        'locked', tm.locked
      ))
      from public.team_members tm
      where tm.company_id = agent.company_id
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'leadStaffId', coalesce(t.lead_staff_id::text, '')
      ))
      from public.teams t
      where t.company_id = agent.company_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.voice_lead_assign_context(text, uuid) from public;
grant execute on function public.voice_lead_assign_context(text, uuid) to anon, authenticated;
