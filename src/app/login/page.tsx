"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TheRoofingCrmMark } from "@/components/brand";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  async function onForgotPassword() {
    if (!email.trim()) {
      toast.message("Enter your email first, then tap Forgot Password.");
      return;
    }
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/login`,
      });
      if (error) {
        toast.error(authErrorMessage(error));
        return;
      }
      toast.success("Check your email for a reset link.");
    } catch (error) {
      toast.error(authErrorMessage(error instanceof Error ? error.message : "Could not send reset email."));
    }
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-[#1a1a1a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1600&q=60)",
          filter: "blur(2px) grayscale(0.35) brightness(0.45)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/55" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-[22rem] flex-col items-center">
          <TheRoofingCrmMark className="size-7 text-[#c8102e]" />
          <p className="font-script mt-4 text-center text-[2.35rem] leading-none text-white">
            Where Legacy Gets Built
          </p>
          <h1 className="mt-7 text-[1.35rem] font-normal tracking-wide">Sign In</h1>

          <form onSubmit={onSubmit} className="mt-5 w-full space-y-3.5">
            {formError ? (
              <p className="text-center text-sm text-red-300">{formError}</p>
            ) : null}
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="User Name"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="h-12 w-full rounded-lg border-0 bg-white px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="h-12 w-full rounded-lg border-0 bg-white px-4 pr-11 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="h-12 w-full rounded-full bg-gradient-to-r from-[#3d5a7a] to-[#2a4058] text-base font-medium text-white transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              {pending ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <button
            type="button"
            onClick={onForgotPassword}
            className="mt-5 text-sm text-white/90 hover:text-white"
          >
            Forgot Password
          </button>
        </div>
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 pb-8 text-sm text-white/90">
        <span className="cursor-default">Privacy Policy</span>
        <span className="cursor-default">Terms of Service</span>
        <Link href="/signup" className="hover:text-white">
          Create an account
        </Link>
      </footer>
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
