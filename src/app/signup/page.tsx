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
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function SignupPage() {
  const router = useRouter();
  const [configured, setConfigured] = useState(isSupabaseConfigured());
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("Northline Construction");
  const [title, setTitle] = useState("VP, Preconstruction");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured()) {
      toast.error("Connect the Supabase project first.");
      return;
    }
    setPending(true);
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
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    }
    toast.success("Check your email to confirm the account, then sign in.");
    router.replace("/login");
  }

  return (
    <AuthFrame
      title="Create your GC workspace"
      description="A company, your profile, and the Northline sample book are created in Postgres on first sign-in."
    >
      {configured ? (
        <form onSubmit={onSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            placeholder="Jordan Hale"
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
        <Button type="submit" disabled={pending}>
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
