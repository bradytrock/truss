"use client";

import { useSignIn } from "@clerk/nextjs";
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
import { authErrorMessage } from "@/lib/auth-errors";
import { clerkBrowserEnabled } from "@/lib/clerk-browser";
import { readInviteClerkResponse } from "@/lib/clerk-seat";
import {
  inviteBlockReason,
  inviteCanRenew,
  parseInviteGate,
  type InviteGate,
} from "@/lib/invite-onboarding";
import { railwayDatabaseEnabled } from "@/lib/railway-rest";
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

type ClerkSignIn = ReturnType<typeof useSignIn>["signIn"];

function InviteSignupForm({ token, signIn }: { token: string; signIn: ClerkSignIn | null }) {
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
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        setSessionEmail(sessionData.session?.user.email ?? null);
      } catch {
        setSessionEmail(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
      if (sessionEmail && !signIn) {
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

  async function openClerkLogin() {
    if (!signIn) return "continue" as const;
    const response = await fetch("/api/auth/invite-clerk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password, fullName }),
    });
    const body = (await response.json().catch(() => null)) as unknown;
    const parsed = readInviteClerkResponse(response.status, body);
    if (parsed.kind === "error") {
      setFormError(parsed.message);
      toast.error(parsed.message);
      return "error" as const;
    }
    if (parsed.kind !== "ticket") return "skipped" as const;
    const { error } = await signIn.ticket({ ticket: parsed.ticket });
    if (error) {
      const message = error.longMessage || error.message || "Could not sign in.";
      setFormError(message);
      toast.error(message);
      return "error" as const;
    }
    if (signIn.status !== "complete") {
      const message = "Your login is ready. Sign in with the password you just chose.";
      setFormError(message);
      toast.message(message);
      return "error" as const;
    }
    const finalized = await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl("/welcome");
        if (url.startsWith("http")) window.location.assign(url);
        else router.replace(url);
      },
    });
    if (finalized.error) {
      const message = finalized.error.longMessage || finalized.error.message || "Could not sign in.";
      setFormError(message);
      toast.error(message);
      return "error" as const;
    }
    return "handoff" as const;
  }

  async function finishJoined(companyName: string) {
    const opened = await openClerkLogin();
    if (opened === "error" || opened === "handoff") return;
    toast.success(`Joined ${companyName}`);
    router.replace("/welcome");
    router.refresh();
  }

  async function onClerkSignIn(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      const opened = await openClerkLogin();
      if (opened === "skipped" || opened === "continue") {
        router.replace(`/login?next=${encodeURIComponent("/welcome")}`);
      }
    } catch (error) {
      const message = authErrorMessage(error instanceof Error ? error.message : "Could not sign in.");
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!gate) return;
    setFormError(null);
    if (railwayDatabaseEnabled()) {
      const message = "New companies sign in with Clerk. Accounts are not created in Supabase.";
      setFormError(message);
      toast.error(message);
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
          await finishJoined(gate.companyName);
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
        await finishJoined(gate.companyName);
        return;
      }
      const message = signIn
        ? "Account created, but this project requires email confirmation. Confirm the email, then open this invite again and use the same password."
        : "Account created, but this project requires email confirmation. Confirm the email, then sign in. Setup continues from where you left off.";
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

  if (gate?.status === "used" && signIn) {
    return (
      <AuthFrame
        title="Sign in"
        description={`Use the password you chose for ${gate.email}. That signs you in, and creates the login if it is missing.`}
      >
        <form onSubmit={(event) => void onClerkSignIn(event)} className="grid gap-3">
          {formError ? <ErrorNote message={formError} /> : null}
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
                autoComplete="current-password"
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
          <Button type="submit" nativeButton disabled={pending}>
            {pending ? "Working…" : "Sign in"}
          </Button>
          <Button type="button" nativeButton variant="outline" disabled={pending || renewed} onClick={() => void onRenew()}>
            {renewed ? "Request sent" : pending ? "Sending…" : "Request a new invite"}
          </Button>
        </form>
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

  const signedIn = !signIn && Boolean(sessionEmail);
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
  return <InviteSignupForm token={token} signIn={signIn} />;
}

export function InviteSignup({ token }: { token: string }) {
  if (clerkBrowserEnabled()) return <ClerkInviteSignup token={token} />;
  return <InviteSignupForm token={token} signIn={null} />;
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
