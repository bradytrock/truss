import { normalizeSeatEmail } from "./accounts.ts";
import { inviteBlockReason, type InviteGateStatus } from "./invite-onboarding.ts";

export type InviteClerkOutcome =
  | { ok: true; skipped: true }
  | { ok: true; ticket: string }
  | { ok: false; status: number; error: string };

export type InviteClerkClientResult =
  | { kind: "skipped" }
  | { kind: "ticket"; ticket: string }
  | { kind: "error"; message: string };

type InviteClerkDeps = {
  loadInvite: (token: string) => Promise<{ status: InviteGateStatus; email: string } | null>;
  findClerkUserId: (email: string) => Promise<string | null>;
  createClerkUser: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
  }) => Promise<string>;
  passwordMatchesClerk: (userId: string, password: string) => Promise<boolean>;
  claimSeat: (token: string, userId: string, fullName: string) => Promise<void>;
  createTicket: (userId: string) => Promise<string>;
  deleteClerkUser: (userId: string) => Promise<void>;
};

const PASSWORD_MIN = 8;

export function splitPersonName(fullName: string): { firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Teammate" };
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function clerkFailureMessage(error: unknown) {
  const record = error && typeof error === "object" ? (error as { message?: unknown; errors?: unknown }) : null;
  const first = Array.isArray(record?.errors) ? record.errors[0] : null;
  const detail = first && typeof first === "object" ? (first as { code?: unknown; message?: unknown; longMessage?: unknown }) : null;
  const code = typeof detail?.code === "string" ? detail.code : "";
  if (code === "form_password_pwned") return "Choose a password that has not appeared in a data breach.";
  if (code === "form_password_length_too_short" || code === "form_password_size_in_bytes_exceeded") {
    return "Use at least 8 characters.";
  }
  const longMessage = typeof detail?.longMessage === "string" ? detail.longMessage : "";
  const message = typeof detail?.message === "string" ? detail.message : "";
  const fallback = typeof record?.message === "string" ? record.message : "";
  return longMessage || message || fallback || "Could not create the Clerk login.";
}

function identifierExists(error: unknown) {
  const record = error && typeof error === "object" ? (error as { errors?: unknown; message?: unknown }) : null;
  const first = Array.isArray(record?.errors) ? record.errors[0] : null;
  const code = first && typeof first === "object" ? (first as { code?: unknown }).code : "";
  if (code === "form_identifier_exists") return true;
  const message = typeof record?.message === "string" ? record.message.toLowerCase() : "";
  return message.includes("identifier") && message.includes("exists");
}

/**
 * Creates the Clerk user for an invited seat and returns a one-time sign-in ticket.
 * The seat is claimed in the database without a Supabase Auth user. An existing Clerk
 * user is reused only when that same password matches; it is never overwritten.
 */
export async function issueInviteClerkTicket(
  input: {
    configured: boolean;
    token: string;
    password: string;
    fullName: string;
  } & InviteClerkDeps,
): Promise<InviteClerkOutcome> {
  if (!input.configured) return { ok: true, skipped: true };

  const token = input.token.trim();
  if (!token) return { ok: false, status: 400, error: "That invite is missing." };
  if (input.password.length < PASSWORD_MIN) return { ok: false, status: 400, error: "Use at least 8 characters." };

  let invite: { status: InviteGateStatus; email: string } | null;
  try {
    invite = await input.loadInvite(token);
  } catch {
    return { ok: false, status: 400, error: "Could not load that invite." };
  }
  if (!invite?.email.trim()) return { ok: false, status: 404, error: "That invite is missing." };
  if (invite.status !== "accepted" && invite.status !== "used") {
    const message =
      invite.status === "open"
        ? "Accept the invitation before creating the account."
        : inviteBlockReason(invite.status);
    return { ok: false, status: 409, error: message };
  }

  const email = normalizeSeatEmail(invite.email);
  const name = splitPersonName(input.fullName);
  let userId: string | null = null;
  let createdNow = false;
  try {
    userId = await input.findClerkUserId(email);
  } catch (error) {
    return { ok: false, status: 502, error: clerkFailureMessage(error) };
  }

  if (!userId) {
    try {
      userId = await input.createClerkUser({
        email,
        password: input.password,
        firstName: name.firstName,
        ...(name.lastName ? { lastName: name.lastName } : {}),
      });
      createdNow = true;
    } catch (error) {
      if (!identifierExists(error)) return { ok: false, status: 400, error: clerkFailureMessage(error) };
      try {
        userId = await input.findClerkUserId(email);
      } catch (lookupError) {
        return { ok: false, status: 502, error: clerkFailureMessage(lookupError) };
      }
    }
  }

  if (!userId) {
    return { ok: false, status: 409, error: "That email already has a Clerk login. Sign in with that password." };
  }

  if (!createdNow) {
    let matches = false;
    try {
      matches = await input.passwordMatchesClerk(userId, input.password);
    } catch {
      matches = false;
    }
    if (!matches) {
      return {
        ok: false,
        status: 409,
        error: "That email already has a Clerk login with a different password. Sign in with that password.",
      };
    }
  }

  try {
    await input.claimSeat(token, userId, input.fullName);
  } catch (error) {
    if (createdNow) {
      try {
        await input.deleteClerkUser(userId);
      } catch {
        // The next attempt verifies the password and claims the seat for the user left behind.
      }
    }
    return {
      ok: false,
      status: 409,
      error: clerkFailureMessage(error) || "Could not attach this login to your profile. Try again in a moment.",
    };
  }

  try {
    const ticket = (await input.createTicket(userId)).trim();
    if (!ticket) return { ok: false, status: 502, error: "Could not start the Clerk sign-in." };
    return { ok: true, ticket };
  } catch (error) {
    return { ok: false, status: 502, error: clerkFailureMessage(error) };
  }
}

export function readInviteClerkResponse(status: number, body: unknown): InviteClerkClientResult {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (status === 200 && record.skipped === true) return { kind: "skipped" };
  if (status === 200 && typeof record.ticket === "string" && record.ticket.trim()) {
    return { kind: "ticket", ticket: record.ticket.trim() };
  }
  const message = typeof record.error === "string" && record.error.trim() ? record.error.trim() : "";
  return { kind: "error", message: message || "Could not create the Clerk login." };
}
