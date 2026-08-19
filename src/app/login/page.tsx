"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConnectSupabaseForm } from "@/components/connect-supabase";
import { AuthFrame } from "@/components/auth-frame";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [configured, setConfigured] = useState(isSupabaseConfigured());
  const [formError, setFormError] = useState<string | null>(searchParams.get("error"));

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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = authErrorMessage(error);
        setFormError(message);
        toast.error(message);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (error) {
      const message = authErrorMessage(error instanceof Error ? error.message : "Could not sign in.");
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      title="Sign in to Truss"
      description="Auth, Postgres, Realtime, and Storage run on your Supabase project. Confirm email is currently on for this project, so a new account will not get a session until that setting is off."
    >
      {configured ? (
        <form onSubmit={onSubmit} className="grid gap-3">
          {formError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <Button type="submit" nativeButton disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : (
        <ConnectSupabaseForm onConnected={() => setConfigured(true)} />
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {configured ? (
          <>
            New company?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
            <span className="block mt-2">
              Or{" "}
              <Link href="/" className="font-medium text-primary hover:underline">
                open the Northline sample book
              </Link>{" "}
              without signing in.
            </span>
          </>
        ) : (
          <>
            Or{" "}
            <Link href="/" className="font-medium text-primary hover:underline">
              browse the Northline sample book
            </Link>{" "}
            without a project.
          </>
        )}
      </p>
    </AuthFrame>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
