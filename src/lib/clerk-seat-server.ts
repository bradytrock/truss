import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { clerkConfigured } from "@/lib/clerk-env";
import { issueInviteClerkTicket } from "@/lib/clerk-seat";
import { parseInviteGate } from "@/lib/invite-onboarding";
import { railwayDatabaseEnabled } from "@/lib/railway-rest";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";

const TICKET_SECONDS = 120;

function anonClient() {
  return createClient(getSupabaseUrl(), getSupabaseKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

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

function claimFailure(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  if (error.code === "PGRST202" || /claim_clerk_invite/i.test(message)) {
    return "This invite cannot be finished yet. Ask the person who invited you to try again later.";
  }
  return message || "Could not attach this login to your profile.";
}

async function claimSeat(token: string, clerkUserId: string, fullName: string) {
  if (railwayDatabaseEnabled()) {
    const db = databasePool();
    if (!db) throw new Error("This invite cannot be finished yet. Ask the person who invited you to try again later.");
    try {
      await db.query("select public.claim_clerk_invite($1, $2, $3)", [token, clerkUserId, fullName]);
    } catch (error) {
      throw new Error(claimFailure(error instanceof Error ? error : { message: "" }));
    }
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!serviceKey) {
    throw new Error("This invite cannot be finished yet. Ask the person who invited you to try again later.");
  }
  const supabase = createClient(getSupabaseUrl(), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.rpc("claim_clerk_invite", {
    p_token: token,
    p_clerk_sub: clerkUserId,
    p_full_name: fullName,
  });
  if (error) throw new Error(claimFailure(error));
}

/** Clerk login for someone who just created an invited account with this password. */
export async function openInviteClerkLogin(input: { token: string; password: string; fullName: string }) {
  return issueInviteClerkTicket({
    configured: clerkConfigured(),
    token: input.token,
    password: input.password,
    fullName: input.fullName,
    loadInvite: async (token) => {
      const supabase = anonClient();
      const { data, error } = await supabase.rpc("invite_gate", { p_token: token });
      if (error) throw new Error(error.message);
      const gate = parseInviteGate(data);
      return { status: gate.status, email: gate.email };
    },
    findClerkUserId: async (email) => {
      const clerk = await clerkClient();
      const list = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
      return list.data[0]?.id ?? null;
    },
    createClerkUser: async (person) => {
      const clerk = await clerkClient();
      const user = await clerk.users.createUser({
        emailAddress: [person.email],
        password: person.password,
        firstName: person.firstName,
        ...(person.lastName ? { lastName: person.lastName } : {}),
        legalAcceptedAt: new Date(),
      });
      return user.id;
    },
    passwordMatchesClerk: async (userId, password) => {
      const clerk = await clerkClient();
      try {
        await clerk.users.verifyPassword({ userId, password });
        return true;
      } catch {
        return false;
      }
    },
    createTicket: async (userId) => {
      const clerk = await clerkClient();
      const ticket = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: TICKET_SECONDS });
      return ticket.token;
    },
    claimSeat,
    deleteClerkUser: async (userId) => {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(userId);
    },
  });
}
