import { claimString, CLERK_PROFILE_CLAIM, decodeJwtPayload, profileIdFromJwt } from "@/lib/clerk-profile";

type TokenGetter = () => Promise<string | null>;

export type BrowserSessionUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

type ClerkIdentity = {
  email: string | null;
  fullName: string;
  metadata: Record<string, unknown>;
  getToken: TokenGetter;
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

let loaded = !clerkPublishableKey();
let identity: ClerkIdentity | null = null;
const waiters = new Set<() => void>();

function clerkPublishableKey() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());
}

/** Clerk is not the session. Sign-in, signup, and invites use Supabase Auth. */
export function clerkBrowserEnabled() {
  return false;
}

export function clerkBrowserSignedIn() {
  return Boolean(identity);
}

/** Supabase client option. Present only while a Clerk session is signed in. */
export function clerkDataToken(): TokenGetter | null {
  if (!identity) return null;
  const getToken = identity.getToken;
  return () => getToken();
}

export function publishClerkBrowser(next: { loaded: boolean; identity: ClerkIdentity | null }) {
  loaded = next.loaded;
  identity = next.identity;
  for (const waiter of waiters) waiter();
  waiters.clear();
}

export function waitForClerkBrowser() {
  if (!clerkBrowserEnabled() || loaded) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(done);
      resolve();
    }, 5000);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    waiters.add(done);
  });
}

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

export async function readBrowserSessionUser(supabase: SessionClient): Promise<BrowserSessionUser | null> {
  await waitForClerkBrowser();
  if (identity) {
    const token = await identity.getToken();
    const claims = decodeJwtPayload(token);
    let profileId = profileIdFromJwt(claims);
    if (!profileId) {
      const { createClient } = await import("@/lib/supabase/client");
      profileId = await profileIdFromDatabase(createClient());
    }
    if (!profileId) return null;
    const fullName = identity.fullName || claimString(claims, "full_name") || claimString(claims, "name") || "";
    return {
      id: profileId,
      email: identity.email ?? claimString(claims, "email"),
      user_metadata: {
        ...identity.metadata,
        ...(fullName ? { full_name: fullName } : {}),
      },
    };
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

type ClerkGlobal = {
  Clerk?: {
    signOut: () => Promise<void>;
  };
};

export async function signOutBrowserSession() {
  if (identity) {
    const clerk = (globalThis as ClerkGlobal).Clerk;
    if (clerk) await clerk.signOut();
    return;
  }
  const { createClient } = await import("@/lib/supabase/client");
  await createClient().auth.signOut();
}
