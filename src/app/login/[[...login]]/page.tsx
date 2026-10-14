import Link from "next/link";
import { clerkConfigured } from "@/lib/clerk-env";
import { railwayDatabaseEnabled } from "@/lib/railway-rest";

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!clerkConfigured()) {
    if (railwayDatabaseEnabled()) {
      return (
        <div className="flex min-h-full flex-1 items-center justify-center bg-[#1a1a1a] px-6 text-center text-white">
          <p className="max-w-sm text-sm text-white/80">
            Sign-in uses Clerk. Add the Clerk keys on the host. Logins are not sent to Supabase.
          </p>
        </div>
      );
    }
    const { LoginForm } = await import("../login-form");
    return <LoginForm />;
  }

  const { SignIn } = await import("@clerk/nextjs");

  const params = await searchParams;
  const dest = safeNext(params.next);
  const error = params.error?.trim() ?? "";

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-[#1a1a1a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage: "url(/login-bg.jpg)",
          filter: "blur(2px) grayscale(0.35) brightness(0.45)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/55" />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16">
        {error ? <p className="mb-4 max-w-sm text-center text-sm text-red-300">{error}</p> : null}
        <SignIn
          path="/login"
          routing="path"
          fallbackRedirectUrl={dest}
          forceRedirectUrl={dest}
          signUpUrl="/signup"
          withSignUp={false}
        />
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
