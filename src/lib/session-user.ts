export type SessionUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

type SessionClient = {
  auth: {
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
