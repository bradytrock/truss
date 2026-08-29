-- Signature audit (IP, device, hash) is office-only. Guests must not fetch it by share token.
revoke execute on function public.shared_estimate_audit(text) from anon;
grant execute on function public.shared_estimate_audit(text) to authenticated;
