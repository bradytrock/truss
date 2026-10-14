"use server";

import {
  isMissingAccountManagement,
  missingAccountManagementMessage,
  normalizeSeatEmail,
} from "@/lib/accounts";
import { appOrigin } from "@/lib/app-origin";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";
import { signupUserMetadata } from "@/lib/welcome";

type AuthClient = Awaited<ReturnType<typeof createClient>>;

export type RegisterResult = { error: string } | { redirectTo: string } | { confirmation: string };

function claimErrorMessage(error: { message?: string; code?: string }) {
  return isMissingAccountManagement(error)
    ? missingAccountManagementMessage()
    : error.message || "Could not join that company.";
}

async function claimInviteIfNeeded(supabase: AuthClient, token: string, invitedCompanyId?: string) {
  const { error } = await supabase.rpc("claim_invite", { p_token: token });
  if (!error) return { ok: true as const };
  const missing = /missing or expired/i.test(error.message ?? "");
  if (missing) {
    const { data: sessionData } = await supabase.auth.getUser();
    const userId = sessionData.user?.id;
    if (userId && invitedCompanyId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.company_id === invitedCompanyId) return { ok: true as const };
    }
    if (userId && !invitedCompanyId) return { ok: true as const };
  }
  return { ok: false as const, message: claimErrorMessage(error) };
}

export async function registerAccount(input: {
  email: string;
  password: string;
  fullName: string;
  company: string;
  title: string;
  inviteToken?: string;
  invitedCompanyId?: string;
  invitedEmail?: string;
}): Promise<RegisterResult> {
  const email = input.email.trim();
  const inviteToken = input.inviteToken?.trim() ?? "";
  const fullName = input.fullName.trim();
  const company = input.company.trim();
  const title = input.title.trim();
  if (inviteToken && input.invitedEmail && normalizeSeatEmail(email) !== normalizeSeatEmail(input.invitedEmail)) {
    return { error: "Sign up with the email this invite was sent to." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase.auth.getUser();
  if (existing.user) {
    if (!inviteToken) return { redirectTo: "/" };
    const claimed = await claimInviteIfNeeded(supabase, inviteToken, input.invitedCompanyId);
    if (!claimed.ok) return { error: claimed.message };
    return { redirectTo: "/?welcome=1" };
  }

  if (input.password.trim().length < 8) return { error: "Use at least 8 characters for the password." };

  const origin = await appOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: signupUserMetadata({
        fullName,
        company,
        title,
        inviteToken: inviteToken || undefined,
      }),
    },
  });

  if (error) {
    const already = /already registered|already exists|user already/i.test(error.message) && Boolean(inviteToken);
    if (!already) return { error: authErrorMessage(error) };
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: input.password });
    if (signInError) {
      const message = authErrorMessage(signInError);
      return {
        error: `${message} This email already has a login. Sign in, then open the invite link again.`,
      };
    }
    const claimed = await claimInviteIfNeeded(supabase, inviteToken, input.invitedCompanyId);
    if (!claimed.ok) return { error: claimed.message };
    return { redirectTo: "/?welcome=1" };
  }

  if (data.session) {
    if (inviteToken) {
      const claimed = await claimInviteIfNeeded(supabase, inviteToken, input.invitedCompanyId);
      if (!claimed.ok) return { error: claimed.message };
    }
    return { redirectTo: "/?welcome=1" };
  }

  return {
    confirmation: inviteToken
      ? "Account created, but this project requires email confirmation. Confirm the email, then sign in to join the company."
      : "Account created, but this project requires email confirmation, so you cannot sign in yet. In Supabase: Authentication → Providers → Email → turn off Confirm email. Then sign in.",
  };
}
