"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthFrame } from "@/components/auth-frame";
import {
  isMissingAccountManagement,
  missingAccountManagementMessage,
  normalizeSeatEmail,
} from "@/lib/accounts";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";
import type { SeatRole } from "@/lib/types";
import { SEAT_ROLE_LABELS } from "@/lib/types";

type InvitePreview = {
  company_id?: string;
  company_name: string;
  seat_name: string;
  seat_title: string;
  seat_role: SeatRole;
  email: string;
  expires_at: string;
};

function firstInviteRow(data: InvitePreview[] | InvitePreview | null) {
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

function claimErrorMessage(error: { message?: string; code?: string }) {
  return isMissingAccountManagement(error)
    ? missingAccountManagementMessage()
    : error.message || "Could not join that company.";
}

async function claimInviteIfNeeded(
  supabase: ReturnType<typeof createClient>,
  token: string,
  invitedCompanyId?: string,
) {
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
      if (profile?.company_id === invitedCompanyId) {
        return { ok: true as const };
      }
    }
    if (userId && !invitedCompanyId) {
      // Older invite_preview did not return company_id; the auth trigger likely consumed the row.
      return { ok: true as const };
    }
  }
  return { ok: false as const, message: claimErrorMessage(error) };
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";
  const [pending, setPending] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken));
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("Northline Construction");
  const [title, setTitle] = useState("Company admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setInviteLoading(false);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase.rpc("invite_preview", { p_token: inviteToken });
      if (cancelled) return;
      if (error) {
        setInviteError(
          isMissingAccountManagement(error)
            ? missingAccountManagementMessage()
            : error.message || "Could not load that invite.",
        );
        setInviteLoading(false);
        return;
      }
      const row = firstInviteRow(data as InvitePreview[] | InvitePreview | null);
      if (!row) {
        setInviteError("That invite is missing or expired. Ask a company admin to send a new one.");
        setInviteLoading(false);
        return;
      }
      setInvite(row);
      setFullName(row.seat_name);
      setTitle(row.seat_title);
      setEmail(row.email);
      setInviteLoading(false);

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        setAlreadySignedIn(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (invite && normalizeSeatEmail(email) !== normalizeSeatEmail(invite.email)) {
      const message = "Sign up with the email this invite was sent to.";
      setFormError(message);
      toast.error(message);
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      if (alreadySignedIn && inviteToken) {
        const claimed = await claimInviteIfNeeded(supabase, inviteToken, invite?.company_id);
        if (!claimed.ok) {
          setFormError(claimed.message);
          toast.error(claimed.message);
          return;
        }
        toast.success(invite ? `Joined ${invite.company_name}` : "Joined company");
        router.replace("/");
        router.refresh();
        return;
      }
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: {
            full_name: fullName,
            company: invite ? invite.company_name : company,
            title,
            ...(inviteToken ? { invite_token: inviteToken } : {}),
          },
        },
      });
      if (error) {
        const already =
          /already registered|already exists|user already/i.test(error.message) && Boolean(inviteToken);
        if (already) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) {
            const message = authErrorMessage(signInError);
            setFormError(
              `${message} This email already has a login. Sign in, then open the invite link again.`,
            );
            toast.error(message);
            return;
          }
          const claimed = await claimInviteIfNeeded(supabase, inviteToken, invite?.company_id);
          if (!claimed.ok) {
            setFormError(claimed.message);
            toast.error(claimed.message);
            return;
          }
          toast.success(invite ? `Joined ${invite.company_name}` : "Signed in");
          router.replace("/");
          router.refresh();
          return;
        }
        const message = authErrorMessage(error);
        setFormError(message);
        toast.error(message);
        return;
      }
      if (data.session) {
        if (inviteToken) {
          const claimed = await claimInviteIfNeeded(supabase, inviteToken, invite?.company_id);
          if (!claimed.ok) {
            setFormError(claimed.message);
            toast.error(claimed.message);
            return;
          }
          toast.success(invite ? `Joined ${invite.company_name}` : "Account created");
        }
        router.replace("/");
        router.refresh();
        return;
      }
      const message = invite
        ? "Account created, but this project requires email confirmation. Confirm the email, then sign in to join the company."
        : "Account created, but this project requires email confirmation, so you cannot sign in yet. In Supabase: Authentication → Providers → Email → turn off Confirm email. Then sign in.";
      setFormError(message);
      toast.message(message);
    } catch (error) {
      const message = authErrorMessage(error instanceof Error ? error.message : "Could not create the account.");
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const joining = Boolean(invite);
  const titleText = joining ? `Join ${invite?.company_name}` : "Create your GC workspace";
  const description = joining
    ? alreadySignedIn
      ? `You're already signed in. Join ${invite?.company_name} as ${invite?.email} — you will land on that company, not a new one.`
      : `This invite is for ${invite?.email} as ${invite?.seat_title || SEAT_ROLE_LABELS[invite?.seat_role ?? "project_manager"]}. You will land on the existing company, not a new one.`
    : "A company, your profile, and your seat are created in Postgres on first sign-in.";

  return (
    <AuthFrame title={titleText} description={description}>
      <form onSubmit={onSubmit} className="grid gap-3">
          {inviteLoading ? (
            <p className="text-sm text-muted-foreground">Looking up the invite…</p>
          ) : null}
          {inviteError ? (
            <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {inviteError}
            </p>
          ) : null}
          {formError ? (
            <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              placeholder="Your name"
            />
          </div>
          {joining ? (
            <div className="grid gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder="Company admin"
                />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              readOnly={joining}
            />
          </div>
          {alreadySignedIn && joining ? null : (
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!alreadySignedIn}
            />
          </div>
          )}
          <Button
            type="submit"
            nativeButton
            disabled={pending || inviteLoading || Boolean(inviteToken && !invite)}
          >
            {pending ? "Working…" : joining ? "Join company" : "Create account"}
          </Button>
        </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already on Truss?{" "}
        <Link
          href={inviteToken ? `/login?next=${encodeURIComponent(`/signup?invite=${inviteToken}`)}` : "/login"}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
