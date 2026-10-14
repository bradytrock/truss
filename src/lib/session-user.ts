import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkConfigured } from "@/lib/clerk-env";
import {
  claimString,
  CLERK_PROFILE_CLAIM,
  decodeJwtPayload,
  profileIdFromJwt,
} from "@/lib/clerk-profile";

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

async function profileIdFromDatabase(supabase: SessionClient) {
  try {
    const { data, error } = await (
      supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }
    ).rpc("current_profile_id");
    if (error) return null;
    return profileIdFromJwt({ [CLERK_PROFILE_CLAIM]: data });
  } catch {
    return null;
  }
}

async function clerkSessionUser(supabase: SessionClient): Promise<SessionUser | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken();
  const claims = decodeJwtPayload(token);
  const profileId = profileIdFromJwt(claims) ?? (await profileIdFromDatabase(supabase));
  if (!profileId) return null;

  let email = claimString(claims, "email");
  let fullName = claimString(claims, "full_name") ?? claimString(claims, "name") ?? "";
  let metadata: Record<string, unknown> = {};
  if (!email || !fullName) {
    const person = await currentUser();
    email = email ?? person?.primaryEmailAddress?.emailAddress ?? null;
    fullName = fullName || [person?.firstName, person?.lastName].filter(Boolean).join(" ");
    if (person?.publicMetadata && typeof person.publicMetadata === "object") {
      metadata = person.publicMetadata as Record<string, unknown>;
    }
  }

  return {
    id: profileId,
    email,
    user_metadata: {
      ...metadata,
      ...(fullName ? { full_name: fullName } : {}),
    },
  };
}

/** Clerk session when it is linked to a profile, otherwise the Supabase auth user. */
export async function readSessionUser(supabase: SessionClient): Promise<SessionUser | null> {
  if (clerkConfigured()) {
    try {
      const clerkUser = await clerkSessionUser(supabase);
      if (clerkUser) return clerkUser;
      const { userId } = await auth();
      if (userId) return null;
    } catch {
      // This request is outside Clerk middleware. Keep the Supabase session.
    }
  }

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
