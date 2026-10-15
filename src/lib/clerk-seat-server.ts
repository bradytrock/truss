import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { clerkConfigured } from "@/lib/clerk-env";
import { linkClerkProfile } from "@/lib/clerk-profile-link";
import { issueInviteClerkTicket } from "@/lib/clerk-seat";
import { parseInviteGate } from "@/lib/invite-onboarding";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";

const TICKET_SECONDS = 120;

function anonClient() {
  return createClient(getSupabaseUrl(), getSupabaseKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
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
    passwordMatchesAccount: async (email, password) => {
      const supabase = anonClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      return !error && Boolean(data.user);
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
        skipPasswordChecks: true,
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
    linkProfile: (userId, email) => linkClerkProfile(userId, email),
    deleteClerkUser: async (userId) => {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(userId);
    },
  });
}
