"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { TheRoofingCrmMark } from "@/components/brand";
import { authErrorMessage } from "@/lib/auth-errors";
import { PRODUCT_NAME } from "@/lib/product";
import { isWelcomePendingMetadata, queueFirstWelcome } from "@/lib/welcome";

const AuthWelcomePreview = dynamic(
  () => import("@/components/auth-welcome-preview").then((mod) => mod.AuthWelcomePreview),
  { ssr: false },
);

function warmSignIn() {
  void import("@/lib/supabase/client");
  void import("sonner");
}

async function notify(kind: "error" | "success" | "message", message: string) {
  const { toast } = await import("sonner");
  toast[kind](message);
}

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function loginSearch() {
  return window.location.search;
}

function loginQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    nextPath: params.get("next") ?? "/",
  };
}

export function LoginForm() {
  const router = useRouter();
  const search = useSyncExternalStore(subscribeToLocation, loginSearch, () => "");
  const params = new URLSearchParams(search);
  const queryError = params.get("error");
  const showWelcome = params.get("welcome") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null | undefined>(undefined);
  const formError = submitError === undefined ? queryError : submitError;

  useEffect(() => {
    const timer = window.setTimeout(warmSignIn, 250);
    return () => window.clearTimeout(timer);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const { nextPath } = loginQuery();
    setSubmitError(null);
    setPending(true);
    void import("@/lib/crm-store");
    void import("@/components/app-shell");
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = authErrorMessage(error);
        setSubmitError(message);
        void notify("error", message);
        return;
      }
      if (isWelcomePendingMetadata(data.user?.user_metadata)) {
        queueFirstWelcome();
        const dest = nextPath.startsWith("/") ? nextPath : "/";
        const url = new URL(dest, window.location.origin);
        url.searchParams.set("welcome", "1");
        router.replace(`${url.pathname}${url.search}`);
      } else {
        router.replace(nextPath);
      }
      router.refresh();
    } catch (error) {
      const message = authErrorMessage(error instanceof Error ? error.message : "Could not sign in.");
      setSubmitError(message);
      void notify("error", message);
    } finally {
      setPending(false);
    }
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      void notify("message", "Enter your email first, then tap Forgot Password.");
      return;
    }
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/login`,
      });
      if (error) {
        void notify("error", authErrorMessage(error));
        return;
      }
      void notify("success", "Check your email for a reset link.");
    } catch (error) {
      void notify("error", authErrorMessage(error instanceof Error ? error.message : "Could not send reset email."));
    }
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-[#1a1a1a] text-white">
      {showWelcome ? <AuthWelcomePreview /> : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage: "url(/login-bg.jpg)",
          filter: "blur(2px) grayscale(0.35) brightness(0.45)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/55" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-6rem] left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#c8102e]/25 blur-3xl"
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-[22rem] flex-col items-center">
          <TheRoofingCrmMark className="size-7 text-[#c8102e]" />
          <p className="font-heading mt-4 text-center text-[1.15rem] font-medium tracking-tight text-white">
            {PRODUCT_NAME}
          </p>
          <p className="font-script mt-3 text-center text-[2.35rem] leading-none text-white">
            Where Legacy Gets Built
          </p>
          <h1 className="mt-7 text-[1.35rem] font-normal tracking-wide">Sign In</h1>

          <form onSubmit={onSubmit} className="mt-5 w-full space-y-3.5">
            {formError ? <p className="text-center text-sm text-red-300">{formError}</p> : null}
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="User Name"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onFocus={warmSignIn}
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
                onFocus={warmSignIn}
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
        <Link href="/privacy" className="hover:text-white">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-white">
          Terms of Service
        </Link>
        <Link href="/cookies" className="hover:text-white">
          Cookie Policy
        </Link>
        <Link href="/signup" className="hover:text-white">
          Create an account
        </Link>
      </footer>
    </div>
  );
}
