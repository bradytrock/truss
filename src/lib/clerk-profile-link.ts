import pg from "pg";
import { railwayDatabaseEnabled } from "@/lib/railway-rest";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";

const linked = new Set<string>();
let pool: pg.Pool | null = null;

function databasePool() {
  const connectionString = process.env.DATABASE_URL?.trim() ?? "";
  if (!connectionString) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
      max: 2,
    });
  }
  return pool;
}

async function linkOnRailway(clerkUserId: string, email: string) {
  const db = databasePool();
  if (!db) return false;
  const result = await db.query(
    `update public.profiles p
        set clerk_user_id = $1
      where p.id = (
        select profile.id
        from public.profiles profile
        left join public.team_members seat on seat.id = profile.staff_id
        left join auth.users account on account.id = profile.id
        where (profile.clerk_user_id is null or profile.clerk_user_id = $1)
          and (
            lower(coalesce(seat.email, '')) = $2
            or lower(coalesce(account.email, '')) = $2
          )
        order by case when profile.clerk_user_id = $1 then 0 else 1 end, profile.created_at
        limit 1
      )`,
    [clerkUserId, email],
  );
  return (result.rowCount ?? 0) > 0;
}

async function postRpc(name: string, body: Record<string, string>, apiKey: string, bearer: string) {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return false;
  const text = (await response.text()).trim();
  return text.length > 0 && text !== "null";
}

async function linkOnSupabase(clerkUserId: string, email: string, accessToken: string | null) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (serviceKey && email) {
    return postRpc(
      "link_clerk_profile",
      { p_clerk_sub: clerkUserId, p_email: email },
      serviceKey,
      serviceKey,
    );
  }
  const publishable = getSupabaseKey();
  if (!accessToken || !publishable) return false;
  return postRpc("link_clerk_session", {}, publishable, accessToken);
}

/** Attach a Clerk user to the profile that already uses this email. */
export async function linkClerkProfile(clerkUserId: string, email: string, accessToken?: string | null) {
  const sub = clerkUserId.trim();
  const address = email.trim().toLowerCase();
  if (!sub || linked.has(sub)) return;
  try {
    const ok = railwayDatabaseEnabled()
      ? address
        ? await linkOnRailway(sub, address)
        : false
      : await linkOnSupabase(sub, address, accessToken ?? null);
    if (ok) linked.add(sub);
  } catch (error) {
    console.error(
      "[clerk] Could not link this sign-in to a profile.",
      error instanceof Error ? error.message : "",
    );
  }
}
