import type { ClerkSignupInput } from "@/lib/clerk-account";

export type ClerkSignInClient = {
  status: string | null;
  ticket: (args: { ticket: string }) => Promise<{ error: { longMessage?: string; message?: string } | null }>;
  password: (args: {
    emailAddress: string;
    password: string;
  }) => Promise<{ error: { longMessage?: string; message?: string } | null }>;
  finalize: (args: {
    navigate: (params: { decorateUrl: (path: string) => string }) => void | Promise<void>;
  }) => Promise<unknown>;
};

type PostResult = { ok: boolean; status: number; body: unknown };

function errorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function signInError(error: { longMessage?: string; message?: string } | null) {
  return error?.longMessage || error?.message || "Could not sign in.";
}

async function activate(
  signIn: ClerkSignInClient,
  destination: string,
  afterActive?: () => Promise<string | null>,
) {
  if (signIn.status !== "complete") {
    return {
      ok: false as const,
      message: "Sign-in needs another step. Open the sign-in page and use the password you just chose.",
    };
  }
  let failure: string | null = null;
  await signIn.finalize({
    navigate: async ({ decorateUrl }) => {
      failure = afterActive ? await afterActive() : null;
      if (failure) return;
      const url = decorateUrl(destination);
      window.location.assign(url);
    },
  });
  if (failure) return { ok: false as const, message: failure };
  return { ok: true as const };
}

export async function runClerkSignup(input: {
  post: (path: string, body: unknown) => Promise<PostResult>;
  signIn: ClerkSignInClient;
  account: ClerkSignupInput;
  destination: string;
  inviteToken?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const created = await input.post("/api/auth/signup", {
    email: input.account.email,
    password: input.account.password,
    fullName: input.account.fullName,
    company: input.account.company,
    title: input.account.title,
    inviteToken: input.account.inviteToken,
  });
  if (!created.ok) {
    return { ok: false, message: errorMessage(created.body, "Could not create the account.") };
  }

  const payload = created.body as { status?: string; ticket?: string | null };
  if (payload.status === "exists") {
    if (!input.inviteToken) {
      return { ok: false, message: "This email already has a login. Sign in instead." };
    }
    const signed = await input.signIn.password({
      emailAddress: input.account.email,
      password: input.account.password,
    });
    if (signed.error) return { ok: false, message: signInError(signed.error) };
    const inviteToken = input.inviteToken;
    return activate(input.signIn, input.destination, async () => {
      const claim = await input.post("/api/auth/claim-invite", { token: inviteToken });
      if (claim.ok) return null;
      const message = errorMessage(claim.body, "Could not join that company.");
      return /already used/i.test(message) ? null : message;
    });
  }

  if (payload.status !== "created") {
    return { ok: false, message: "Could not create the account." };
  }

  const ticket = payload.ticket?.trim() ?? "";
  const signed = ticket
    ? await input.signIn.ticket({ ticket })
    : await input.signIn.password({
        emailAddress: input.account.email,
        password: input.account.password,
      });
  if (signed.error) return { ok: false, message: signInError(signed.error) };
  return activate(input.signIn, input.destination);
}

export function postClerkAuth(path: string, body: unknown): Promise<PostResult> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { ok: response.ok, status: response.status, body: parsed };
  });
}
