"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(searchParams.get("error"));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
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
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center bg-[#12151c] px-6 py-12 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_55%)]"
      />
      <div className="relative z-10 flex w-full max-w-[22rem] flex-col items-center">
        <BrandMark
          className="inline-flex items-center gap-2 text-white"
          markClassName="size-5 text-[#c8102e]"
        />
        <p className="font-script mt-5 text-center text-[2.4rem] leading-none text-white">
          Where Legacy Gets Built
        </p>
        <h1 className="mt-8 text-xl font-medium tracking-tight">Sign In</h1>

        <form onSubmit={onSubmit} className="mt-6 w-full space-y-3">
          {formError ? (
            <p className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
              {formError}
            </p>
          ) : null}
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-11 rounded-md border-0 bg-white text-base text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-white/40"
          />
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-11 rounded-md border-0 bg-white text-base text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-white/40"
          />
          <Button
            type="submit"
            nativeButton
            disabled={pending}
            className="h-11 w-full rounded-full bg-[#2f4f6f] text-base text-white hover:bg-[#3a5f84]"
          >
            {pending ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <Link
          href="/signup"
          className="mt-5 text-sm text-white/85 transition-colors hover:text-white"
        >
          Create an account
        </Link>
      </div>
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
