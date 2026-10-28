export type SessionUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

type SessionClient = {
  auth: {
    getClaims?: () => Promise<{
      data: {
        claims?: {
          sub?: string;
          email?: string | null;
          user_metadata?: Record<string, unknown> | null;
        };
      } | null;
    }>;
    getUser: () => Promise<{
      data: {
        user: {
          id: string;
          email?: string | null;
          user_metadata?: Record<string, unknown> | null;
        } | null;
      };
    }>;
  };
};

/** Signed-in Supabase Auth user. Profile id is auth.uid(). */
export async function readSessionUser(supabase: SessionClient): Promise<SessionUser | null> {
  try {
    // getClaims checks the token signature locally (cached keys), so it skips the
    // Auth server round trip. It falls back to Auth itself for legacy signing keys.
    if (supabase.auth.getClaims) {
      try {
        const claims = (await supabase.auth.getClaims())?.data?.claims;
        if (claims?.sub) {
          return {
            id: claims.sub,
            email: claims.email ?? null,
            user_metadata: claims.user_metadata ?? {},
          };
        }
      } catch {
        // Fall through to getUser.
      }
    }
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? null,
      user_metadata: user.user_metadata ?? {},
    };
  } catch {
    return null;
  }
}
