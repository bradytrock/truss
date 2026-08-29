-- shared_estimate_audit must include estimateId so the client can parse rows.

create or replace function public.shared_estimate_audit(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  est public.estimates%rowtype;
  v_token text;
begin
  v_token := trim(coalesce(p_token, ''));
  if length(v_token) < 6 then
    return '[]'::jsonb;
  end if;

  select * into est
  from public.estimates
  where share_token = v_token
     or (second_share_token <> '' and second_share_token = v_token)
  limit 1;
  if not found then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'estimateId', e.estimate_id,
      'kind', e.kind,
      'signerRole', e.signer_role,
      'signerName', e.signer_name,
      'tokenSuffix', e.token_suffix,
      'ipAddress', e.ip_address,
      'forwardedFor', e.forwarded_for,
      'userAgent', e.user_agent,
      'acceptLanguage', e.accept_language,
      'timeZone', e.time_zone,
      'deliveryChannel', e.delivery_channel,
      'deliveryTo', e.delivery_to,
      'consentText', e.consent_text,
      'consentVersion', e.consent_version,
      'documentSha256', e.document_sha256,
      'capturedInOffice', e.captured_in_office,
      'createdAt', e.created_at
    ) order by e.created_at)
    from public.estimate_signature_events e
    where e.estimate_id = est.id
  ), '[]'::jsonb);
end;
$$;
