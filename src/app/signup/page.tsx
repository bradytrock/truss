"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthFrame } from "@/components/auth-frame";
import { ConnectSupabaseForm } from "@/components/connect-supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function SignupPage() {
  const router = useRouter();
  const [configured, setConfigured] = useState(isSupabaseConfigured());
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("Northline Construction");
  const [title, setTitle] = useState("Company admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!isSupabaseConfigured()) {
      const message = "Connect the Supabase project first.";
      setFormError(message);
      toast.error(message);
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: {
            full_name: fullName,
            company,
            title,
          },
        },
      });
      if (error) {
        const message = authErrorMessage(error);
        setFormError(message);
        toast.error(message);
        return;
      }
      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }
      const message =
        "Account created, but this project requires email confirmation, so you cannot sign in yet. In Supabase: Authentication → Providers → Email → turn off Confirm email. Then sign in.";
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

  return (
    <AuthFrame
      title="Create your GC workspace"
      description="A company, your profile, and the Northline sample book are created in Postgres on first sign-in."
    >
      {configured ? (
        <form onSubmit={onSubmit} className="grid gap-3">
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
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <Button type="submit" nativeButton disabled={pending}>
          {pending ? "Creating workspace…" : "Create account"}
        </Button>
      </form>
      ) : (
        <ConnectSupabaseForm onConnected={() => setConfigured(true)} />
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already on Truss?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}
