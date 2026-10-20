"use client";

import { Eye, EyeOff, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  AuthenticatingCard,
  ContinueMark,
  SignInBrand,
  SignInCard,
  SignInScreen,
  continueButtonClass,
} from "@/components/sign-in-screen";
import { authErrorMessage } from "@/lib/auth-errors";
import { isWelcomePendingMetadata, queueFirstWelcome } from "@/lib/welcome";

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

const fieldClass =
  "h-[42px] w-full rounded-lg border border-zinc-300 bg-white px-3.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500";

export function LoginForm() {
  const router = useRouter();
  const search = useSyncExternalStore(subscribeToLocation, loginSearch, () => "");
  const params = new URLSearchParams(search);
  const queryError = params.get("error");
  const [step, setStep] = useState<"email" | "password" | "authenticating">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null | undefined>(undefined);
  const formError = submitError === undefined ? queryError : submitError;

  useEffect(() => {
    const timer = window.setTimeout(warmSignIn, 250);
    return () => window.clearTimeout(timer);
  }, []);

  function onEmail(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setStep("password");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const { nextPath } = loginQuery();
    setSubmitError(null);
    setStep("authenticating");
    void import("@/lib/crm-store");
    void import("@/components/app-shell");
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = authErrorMessage(error);
        setSubmitError(message);
        setStep("password");
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
      setStep("password");
      void notify("error", message);
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

  if (step === "authenticating") {
    return (
      <SignInScreen>
        <AuthenticatingCard />
      </SignInScreen>
    );
  }

  return (
    <SignInScreen>
      <SignInCard>
        <div className="flex flex-col gap-7 px-6 py-10 sm:px-11 sm:pt-10 sm:pb-8">
          {step === "email" ? (
            <>
              <SignInBrand
                title="Sign in to TheRoofingCRM"
                subtitle="Welcome back! Please sign in to continue"
              />
              <form onSubmit={onEmail} className="flex flex-col gap-6">
                {formError ? <p className="text-center text-sm text-red-600">{formError}</p> : null}
                <div className="flex flex-col gap-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onFocus={warmSignIn}
                    required
                    className={fieldClass}
                  />
                </div>
                <button type="submit" className={continueButtonClass}>
                  Continue
                  <ContinueMark />
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3.5 text-center">
                <SignInBrand
                  title="Enter your password"
                  subtitle="Enter the password associated with your account"
                />
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{email}</span>
                  <button
                    type="button"
                    aria-label="Change email address"
                    onClick={() => {
                      setSubmitError(null);
                      setStep("email");
                    }}
                    className="inline-flex size-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              </div>
              <form onSubmit={onSubmit} className="flex flex-col gap-6">
                {formError ? <p className="text-center text-sm text-red-600">{formError}</p> : null}
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => void onForgotPassword()}
                      className="text-sm font-medium text-zinc-700 hover:text-zinc-950"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onFocus={warmSignIn}
                      required
                      autoFocus
                      className={`${fieldClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-500 hover:text-zinc-800"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                    </button>
                  </div>
                </div>
                <button type="submit" className={continueButtonClass}>
                  Continue
                  <ContinueMark />
                </button>
              </form>
            </>
          )}
        </div>
      </SignInCard>
    </SignInScreen>
  );
}
