import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareFrame({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="min-h-full bg-muted/40">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-10">
        {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function ShareMissing({ kind }: { kind: "estimate" | "invoice" | "page" }) {
  return (
    <ShareFrame>
      <div className="border bg-card px-5 py-10">
        <h1 className="font-heading text-2xl font-medium">This {kind} is not available</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          The link may have expired, or the contractor reset their sample book. Ask them to send a
          new link from TheRoofingCRM.
        </p>
      </div>
    </ShareFrame>
  );
}

export function ShareLoading() {
  return (
    <ShareFrame>
      <div className="h-24 animate-pulse border bg-muted" />
      <div className="h-[32rem] animate-pulse border bg-muted" />
    </ShareFrame>
  );
}

export function SharePdfButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" disabled={disabled} onClick={onClick}>
      <Download />
      Download PDF
    </Button>
  );
}
