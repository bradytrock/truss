import type { ReactNode } from "react";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-[#1c1914] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-[oklch(0.975_0.01_85)] p-6 text-foreground shadow-xl">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-[#c45c26] text-white">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
              <path
                d="M3 19h18M5 19V9l7-5 7 5v10M9 19v-6h6v6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <p className="font-heading text-sm font-semibold">Truss</p>
            <p className="text-[11px] text-muted-foreground">CRM for general contractors</p>
          </div>
        </div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  );
}
