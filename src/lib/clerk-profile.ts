/** Claim Clerk puts on the Supabase session token. Value is profiles.id, not the Clerk user id. */
export const CLERK_PROFILE_CLAIM = "profile_id";

const PROFILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value: unknown) {
  return typeof value === "string" && PROFILE_UUID.test(value) ? value : null;
}

/**
 * Same choice as public.current_profile_id(): a profile_id claim wins,
 * otherwise a UUID subject (today's Supabase user id).
 */
export function profileIdFromJwt(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null;
  return uuidOrNull(payload[CLERK_PROFILE_CLAIM]) ?? uuidOrNull(payload.sub);
}
