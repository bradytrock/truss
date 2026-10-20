import type { ReactNode } from "react";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/product";

export const SIGN_IN_ACCENT = "#C2410C";

export function RoofTileMark({
  className = "size-12",
  accent = SIGN_IN_ACCENT,
}: {
  className?: string;
  accent?: string;
}) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={className}>
      <rect width="40" height="40" rx="10" fill={accent} />
      <path
        d="M9 22 L20 12 L31 22"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 21 V29 H26 V21"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SignInRoof() {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      fill="none"
      strokeLinejoin="round"
      strokeWidth="3"
    >
      <path d="M120 900 L520 420 L920 900" stroke="#232326" />
      <path d="M520 900 L860 300 L1200 900" stroke="#26262A" />
      <path d="M960 900 L1240 520 L1520 900" stroke="#232326" />
      <path d="M-80 900 L180 600 L440 900" stroke="#212124" />
    </svg>
  );
}

export function SignInScreen({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-between gap-10 overflow-hidden bg-[#18181B] px-4 py-8 text-[#18181B] sm:px-6 sm:py-12">
      <SignInRoof />
      <div className="relative flex w-full flex-1 items-center justify-center">{children}</div>
      <footer className="relative flex flex-wrap items-center justify-center gap-x-9 gap-y-2 text-sm text-zinc-300">
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

export function SignInCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="w-full max-w-[480px] overflow-hidden rounded-[14px] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
      {children}
      {footer}
    </main>
  );
}

export function SignInBrand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <RoofTileMark className="size-[52px]" />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-zinc-600">{subtitle}</p>
      </div>
    </div>
  );
}

export function ContinueMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M3 2 L7 5 L3 8 Z" fill="currentColor" />
    </svg>
  );
}

export const continueButtonClass =
  "flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-zinc-700 to-zinc-800 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] transition-opacity hover:opacity-95 disabled:opacity-60";

export function AuthenticatingCard() {
  return (
    <SignInCard
      footer={
        <div className="flex items-center justify-center gap-2 border-t border-zinc-200 bg-zinc-100 px-6 py-4 text-[13px] text-zinc-600">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Securely signing you in
        </div>
      }
    >
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-7 px-8 py-14 text-center sm:px-11"
      >
        <div className="relative flex size-[84px] items-center justify-center">
          <svg className="absolute inset-0 size-full animate-spin" viewBox="0 0 84 84" aria-hidden>
            <circle cx="42" cy="42" r="38" fill="none" stroke="#E4E4E7" strokeWidth="3" />
            <path
              d="M42 4 A38 38 0 0 1 80 42"
              fill="none"
              stroke={SIGN_IN_ACCENT}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <RoofTileMark className="size-12" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold tracking-tight">Authenticating…</h1>
          <p className="text-sm text-zinc-600">
            Signing you in to {PRODUCT_NAME}. This only takes a moment.
          </p>
        </div>
        <div className="h-1 w-full max-w-[280px] overflow-hidden rounded bg-zinc-100">
          <div className="h-full w-2/5 animate-pulse rounded bg-zinc-800" />
        </div>
      </div>
    </SignInCard>
  );
}
