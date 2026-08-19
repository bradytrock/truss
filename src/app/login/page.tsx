"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AuthFrame } from "@/components/auth-frame";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const configured = isSupabaseConfigured();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!configured) {
      toast.error("Add your Supabase URL and publishable key first.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <AuthFrame
      title="Sign in to Truss"
      description="Your pipeline, jobs, and owners live in Supabase — Auth, Postgres, and Realtime."
    >
      {!configured ? (
        <SetupHint />
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3">
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
          <Button type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        New company?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}

function SetupHint() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">Connect Supabase to continue.</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>Create a project at supabase.com.</li>
        <li>
          Run <code className="text-foreground">supabase/migrations/20260819170000_truss_crm.sql</code> in the SQL editor.
        </li>
        <li>
          Put the project URL and publishable (or anon) key in <code className="text-foreground">.env.local</code>.
        </li>
      </ol>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
