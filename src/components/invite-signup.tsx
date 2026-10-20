"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isMissingAccountManagement,
  missingAccountManagementMessage,
  normalizeSeatEmail,
} from "@/lib/accounts";
import { useSignIn, useUser } from "@clerk/nextjs";
import { authErrorMessage } from "@/lib/auth-errors";
import { clerkBrowserEnabled } from "@/lib/clerk-browser";
import { postClerkAuth, runClerkSignup, type ClerkSignInClient } from "@/lib/clerk-signup-client";
import {
  inviteBlockReason,
  inviteCanRenew,
  parseInviteGate,
  type InviteGate,
} from "@/lib/invite-onboarding";
import { createClient } from "@/lib/supabase/client";
import type { SeatRole } from "@/lib/types";
import { SEAT_ROLE_LABELS } from "@/lib/types";
import { signupUserMetadata } from "@/lib/welcome";

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
  const missing = /missing or expired|already used|declined/i.test(error.message ?? "");
  if (missing && invitedCompanyId) {
    let userId: string | undefined;
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      userId = sessionData.user?.id;
    } catch {
      userId = undefined;
    }
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.company_id === invitedCompanyId) return { ok: true as const };
    }
  }
  return { ok: false as const, message: claimErrorMessage(error) };
}

function InviteSignupForm({
  token,
  clerkSignIn = null,
  clerkEmail,
}: {
  token: string;
  clerkSignIn?: ClerkSignInClient | null;
  clerkEmail?: string | null;
}) {
  const router = useRouter();
  const [gate, setGate] = useState<InviteGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [renewed, setRenewed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase.rpc("invite_gate", { p_token: token });
      if (cancelled) return;
      if (error) {
        setFormError(
          isMissingAccountManagement(error)
            ? "Could not load that invite. Ask the person who invited you to send it again."
            : error.message || "Could not load that invite.",
        );
        setLoading(false);
        return;
      }
      const next = parseInviteGate(data);
      setGate(next);
      setFullName(next.seatName);
      setRenewed(next.reinviteRequested);
      if (clerkSignIn) {
        setSessionEmail(clerkEmail ?? null);
      } else {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          setSessionEmail(sessionData.session?.user.email ?? null);
        } catch {
          setSessionEmail(null);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkEmail, clerkSignIn, token]);

  async function onAccept() {
    setFormError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
      if (error) {
        setFormError(error.message || "Could not accept that invite.");
        return;
      }
      const next = parseInviteGate(data);
      setGate(next);
      if (next.status !== "accepted") {
        setFormError(inviteBlockReason(next.status));
        return;
      }
      if (sessionEmail) {
        await joinSignedIn(next);
      }
    } finally {
      setPending(false);
    }
  }

  async function joinSignedIn(current: InviteGate) {
    setPending(true);
    try {
      if (normalizeSeatEmail(sessionEmail ?? "") !== normalizeSeatEmail(current.email)) {
        const message = `Sign in as ${current.email} to join ${current.companyName}.`;
        setFormError(message);
        toast.error(message);
        return;
      }
      if (clerkBrowserEnabled()) {
        const claimed = await postClerkAuth("/api/auth/claim-invite", { token });
        if (!claimed.ok) {
          const message =
            claimed.body && typeof claimed.body === "object" && "error" in claimed.body
              ? String((claimed.body as { error?: string }).error || "Could not join that company.")
              : "Could not join that company.";
          setFormError(message);
          toast.error(message);
          return;
        }
        toast.success(`Joined ${current.companyName}`);
        router.replace("/welcome");
        router.refresh();
        return;
      }
      const supabase = createClient();
      const claimed = await claimInviteIfNeeded(supabase, token, current.companyId);
      if (!claimed.ok) {
        setFormError(claimed.message);
        toast.error(claimed.message);
        return;
      }
      toast.success(`Joined ${current.companyName}`);
      router.replace("/welcome");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function onDecline() {
    setFormError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("decline_invite", { p_token: token });
      if (error) {
        setFormError(error.message || "Could not decline that invite.");
        return;
      }
      setGate(parseInviteGate(data));
      toast.message("Invite declined.");
    } finally {
      setPending(false);
    }
  }

  async function onRenew() {
    setPending(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("request_invite_renewal", { p_token: token });
      if (error) {
        toast.error(error.message || "Could not send that request.");
        return;
      }
      if (data === "missing") {
        toast.error("That invite is missing, so there is no one to ask.");
        return;
      }
      setRenewed(true);
      toast.success(data === "already" ? "That request was already sent." : "We told the person who invited you.");
    } finally {
      setPending(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!gate) return;
    setFormError(null);
    if (clerkBrowserEnabled()) {
      if (!clerkSignIn) {
        const message = "Sign-in is still loading. Try again.";
        setFormError(message);
        toast.error(message);
        return;
      }
      setPending(true);
      try {
        const result = await runClerkSignup({
          post: postClerkAuth,
          signIn: clerkSignIn,
          account: {
            email: gate.email,
            password,
            fullName,
            company: gate.companyName,
            title: gate.seatTitle || SEAT_ROLE_LABELS[(gate.seatRole || "project_manager") as SeatRole],
            inviteToken: token,
          },
          destination: "/welcome",
          inviteToken: token,
        });
        if (!result.ok) {
          setFormError(result.message);
          toast.error(result.message);
          return;
        }
        toast.success(`Joined ${gate.companyName}`);
      } catch (error) {
        const message = authErrorMessage(error instanceof Error ? error.message : "Could not create the account.");
        setFormError(message);
        toast.error(message);
      } finally {
        setPending(false);
      }
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email: gate.email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: signupUserMetadata({
            fullName,
            company: gate.companyName,
            title: gate.seatTitle || SEAT_ROLE_LABELS[(gate.seatRole || "project_manager") as SeatRole],
            inviteToken: token,
          }),
        },
      });
      if (error) {
        const already = /already registered|already exists|user already/i.test(error.message);
        if (already) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email: gate.email, password });
          if (signInError) {
            const message = authErrorMessage(signInError);
            setFormError(`${message} This email already has a login. Sign in, then open the invite link again.`);
            toast.error(message);
            return;
          }
          const claimed = await claimInviteIfNeeded(supabase, token, gate.companyId);
          if (!claimed.ok) {
            setFormError(claimed.message);
            toast.error(claimed.message);
            return;
          }
          router.replace("/welcome");
          router.refresh();
          return;
        }
        const message = authErrorMessage(error);
        setFormError(message);
        toast.error(message);
        return;
      }
      if (data.session) {
        const claimed = await claimInviteIfNeeded(supabase, token, gate.companyId);
        if (!claimed.ok) {
          setFormError(claimed.message);
          toast.error(claimed.message);
          return;
        }
        toast.success(`Joined ${gate.companyName}`);
        router.replace("/welcome");
        router.refresh();
        return;
      }
      const message =
        "Account created, but this project requires email confirmation. Confirm the email, then sign in. Setup continues from where you left off.";
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

  if (loading) {
    return (
      <AuthFrame title="Join your company" description="Looking up this invite.">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          Looking up the invite…
        </p>
      </AuthFrame>
    );
  }

  if (formError && !gate) {
    return (
      <AuthFrame title="Could not load that invite" description={formError}>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </AuthFrame>
    );
  }

  if (!gate || (gate.status !== "open" && gate.status !== "accepted")) {
    const status = gate?.status ?? "missing";
    const company = gate?.companyName;
    return (
      <AuthFrame
        title="This invite can't be used"
        description={company ? `${inviteBlockReason(status)} It was for ${company}.` : inviteBlockReason(status)}
      >
        {formError ? <ErrorNote message={formError} /> : null}
        {inviteCanRenew(status) ? (
          <Button type="button" nativeButton className="w-full" disabled={pending || renewed} onClick={() => void onRenew()}>
            {renewed ? "Request sent" : pending ? "Sending…" : "Request a new invite"}
          </Button>
        ) : null}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </AuthFrame>
    );
  }

  const role = gate.seatTitle || SEAT_ROLE_LABELS[(gate.seatRole || "project_manager") as SeatRole];
  const expires = gate.expiresAt ? new Date(gate.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

  if (gate.status === "open") {
    return (
      <AuthFrame
        title={`Join ${gate.companyName}`}
        description={`You've been added as ${role}. Accept to create your account on this company.`}
      >
        {formError ? <ErrorNote message={formError} /> : null}
        <dl className="mb-6 grid gap-3 text-sm">
          <Fact label="Company" value={gate.companyName} />
          <Fact label="Role" value={role} />
          <Fact label="Email" value={gate.email} />
          {expires ? <Fact label="Expires" value={expires} /> : null}
        </dl>
        <div className="grid gap-2">
          <Button type="button" nativeButton disabled={pending} onClick={() => void onAccept()}>
            {pending ? "Working…" : "Accept invitation"}
          </Button>
          <Button type="button" nativeButton variant="outline" disabled={pending} onClick={() => void onDecline()}>
            Decline
          </Button>
        </div>
      </AuthFrame>
    );
  }

  const signedIn = Boolean(sessionEmail);
  return (
    <AuthFrame
      title="Create your account"
      description={
        signedIn
          ? `You're signed in as ${sessionEmail}. Continue to join ${gate.companyName} as ${role}.`
          : `This account is for ${gate.email}. You'll land on ${gate.companyName} as ${role}.`
      }
    >
      {signedIn ? (
        <div className="grid gap-2">
          {formError ? <ErrorNote message={formError} /> : null}
          <Button type="button" nativeButton disabled={pending} onClick={() => void joinSignedIn(gate)}>
            {pending ? "Working…" : `Join ${gate.companyName}`}
          </Button>
          <Button type="button" nativeButton variant="outline" disabled={pending} onClick={() => void onDecline()}>
            Decline
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void onCreate(event)} className="grid gap-3">
          {formError ? <ErrorNote message={formError} /> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" value={gate.email} readOnly />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            By joining you agree to the{" "}
            <Link href="/terms" className="font-medium text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <Button type="submit" nativeButton disabled={pending}>
            {pending ? "Working…" : "Create account"}
          </Button>
          <Button type="button" nativeButton variant="outline" disabled={pending} onClick={() => void onDecline()}>
            Decline
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already on Truss?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(`/signup?invite=${token}`)}`}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

function ClerkInviteSignup({ token }: { token: string }) {
  const { signIn } = useSignIn();
  const { isLoaded, user } = useUser();
  return (
    <InviteSignupForm
      token={token}
      clerkSignIn={signIn as ClerkSignInClient | null}
      clerkEmail={isLoaded ? (user?.primaryEmailAddress?.emailAddress ?? null) : null}
    />
  );
}

export function InviteSignup({ token }: { token: string }) {
  if (clerkBrowserEnabled()) return <ClerkInviteSignup token={token} />;
  return <InviteSignupForm token={token} />;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>;
}
