import { clerkClient } from "@clerk/nextjs/server";
import pg from "pg";
import { clerkConfigured } from "@/lib/clerk-env";
import {
  clerkIdentifierTaken,
  missingClerkProvisionMessage,
  readClerkError,
  splitPersonName,
  type ClerkSignupInput,
} from "@/lib/clerk-account";
import { railwayDatabaseEnabled } from "@/lib/railway-rest";
import { getSupabaseUrl } from "@/lib/supabase/env";

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

function signupMetadata(input: ClerkSignupInput) {
  return {
    full_name: input.fullName,
    company: input.company,
    title: input.title,
    welcome_pending: true,
    ...(input.inviteToken ? { invite_token: input.inviteToken } : {}),
  };
}

async function callProvision(
  name: "provision_clerk_user" | "claim_invite_for_clerk",
  args: Record<string, unknown>,
) {
  if (railwayDatabaseEnabled()) {
    const db = databasePool();
    if (!db) throw new Error("DATABASE_URL is not set, so the Clerk profile cannot be saved.");
    if (name === "provision_clerk_user") {
      await db.query(`select public.provision_clerk_user($1::uuid, $2, $3, $4::jsonb)`, [
        args.p_id,
        args.p_clerk_sub,
        args.p_email,
        JSON.stringify(args.p_meta ?? {}),
      ]);
      return null;
    }
    const result = await db.query(`select public.claim_invite_for_clerk($1, $2, $3, $4) as company_id`, [
      args.p_clerk_sub,
      args.p_email,
      args.p_full_name,
      args.p_token,
    ]);
    return (result.rows[0]?.company_id as string | undefined) ?? null;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so the Clerk profile cannot be saved.");
  }
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = (await response.text()).trim();
  if (!response.ok) {
    let message = text || "Could not save this account.";
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // Keep the raw body.
    }
    throw new Error(message);
  }
  if (!text || text === "null") return null;
  try {
    return JSON.parse(text) as string;
  } catch {
    return text.replace(/^"|"$/g, "");
  }
}

export type ClerkRegistration =
  | { status: "created"; ticket: string | null }
  | { status: "exists" }
  | { status: "error"; message: string };

async function signInExistingClerkAccount(
  client: Awaited<ReturnType<typeof clerkClient>>,
  input: ClerkSignupInput,
): Promise<ClerkRegistration> {
  if (!input.inviteToken) return { status: "exists" };
  const matches = await client.users.getUserList({ emailAddress: [input.email], limit: 1 });
  const existing = matches.data[0];
  if (!existing) return { status: "exists" };
  let verified = false;
  try {
    verified = (await client.users.verifyPassword({ userId: existing.id, password: input.password })).verified;
  } catch (error) {
    const parsed = readClerkError(error);
    return { status: "error", message: parsed.message || "That email already has a login. Sign in instead." };
  }
  if (!verified) {
    return {
      status: "error",
      message: "This email already has a login. The password did not match. Sign in, then open the invite again.",
    };
  }
  const claimed = await claimClerkInvite({
    clerkUserId: existing.id,
    email: input.email,
    fullName: input.fullName,
    token: input.inviteToken,
  });
  if (!claimed.ok && !/already used/i.test(claimed.message)) {
    return { status: "error", message: claimed.message };
  }
  try {
    const token = await client.signInTokens.createSignInToken({
      userId: existing.id,
      expiresInSeconds: 120,
    });
    return { status: "created", ticket: token.token };
  } catch {
    return { status: "exists" };
  }
}

/** Create the login in Clerk, then the company profile. Does not write auth.users. */
export async function registerClerkAccount(input: ClerkSignupInput): Promise<ClerkRegistration> {
  if (!clerkConfigured()) {
    return { status: "error", message: "Sign-in uses Clerk. Add the Clerk keys on the host." };
  }

  const client = await clerkClient();
  const profileId = crypto.randomUUID();
  const { firstName, lastName } = splitPersonName(input.fullName);
  let clerkUserId = "";

  try {
    const user = await client.users.createUser({
      emailAddress: [input.email],
      password: input.password,
      firstName,
      ...(lastName ? { lastName } : {}),
      legalAcceptedAt: new Date(),
      publicMetadata: {
        profile_id: profileId,
        welcome_pending: true,
      },
    });
    clerkUserId = user.id;
  } catch (error) {
    const parsed = readClerkError(error);
    if (clerkIdentifierTaken(parsed.code, parsed.message)) {
      return signInExistingClerkAccount(client, input);
    }
    return { status: "error", message: parsed.message };
  }

  try {
    await callProvision("provision_clerk_user", {
      p_id: profileId,
      p_clerk_sub: clerkUserId,
      p_email: input.email,
      p_meta: signupMetadata(input),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this account.";
    try {
      await client.users.deleteUser(clerkUserId);
    } catch {
      // The Clerk user is left in place only when delete also fails.
    }
    return { status: "error", message: missingClerkProvisionMessage(message) };
  }

  try {
    const token = await client.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 120,
    });
    return { status: "created", ticket: token.token };
  } catch {
    return { status: "created", ticket: null };
  }
}

export async function claimClerkInvite(input: {
  clerkUserId: string;
  email: string;
  fullName: string;
  token: string;
}) {
  try {
    const companyId = await callProvision("claim_invite_for_clerk", {
      p_clerk_sub: input.clerkUserId,
      p_email: input.email.trim().toLowerCase(),
      p_full_name: input.fullName.trim(),
      p_token: input.token.trim(),
    });
    return { ok: true as const, companyId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join that company.";
    return { ok: false as const, message: missingClerkProvisionMessage(message) };
  }
}
