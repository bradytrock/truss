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

export function decodeJwtPayload(token: string | null | undefined) {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function claimString(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Shown when Clerk signed in but the token and profiles.clerk_user_id do not name a profile. */
export const CLERK_UNLINKED_PROFILE =
  "This Clerk account is not linked to a Truss profile. The session token needs profile_id, or profiles.clerk_user_id must match this Clerk user.";
