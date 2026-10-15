import pg from "pg";

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

/** Attach a Clerk user to the profile that already uses this email. */
export async function linkClerkProfile(clerkUserId: string, email: string) {
  const sub = clerkUserId.trim();
  const address = email.trim().toLowerCase();
  if (!sub || !address || linked.has(sub)) return;
  const db = databasePool();
  if (!db) return;
  try {
    const result = await db.query(
      `update public.profiles p
          set clerk_user_id = $1
         from auth.users u
        where u.id = p.id
          and lower(u.email) = $2
          and (p.clerk_user_id is null or p.clerk_user_id = $1)`,
      [sub, address],
    );
    if ((result.rowCount ?? 0) > 0) linked.add(sub);
  } catch (error) {
    console.error(
      "[clerk] Could not link this sign-in to a profile.",
      error instanceof Error ? error.message : "",
    );
  }
}
