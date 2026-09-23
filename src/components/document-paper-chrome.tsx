import type { ReactNode } from "react";
import { formatPhone } from "@/lib/format";
import type { ProjectManagerContact } from "@/lib/document-owner";
import {
  PAPER_CARD_HEX,
  PAPER_INK_HEX,
  PAPER_MUTED_HEX,
  PAPER_RED_HEX,
  paperCompanyLines,
  paperFooterLeft,
  paperKindLabel,
  type PaperKind,
  type PaperMetaItem,
} from "@/lib/document-paper";
import { cn } from "@/lib/utils";
import type { CompanySettings } from "@/lib/types";

export function PaperSheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("overflow-hidden rounded-md border bg-white shadow-sm", className)}
      style={{ color: PAPER_INK_HEX }}
    >
      <div className="h-1.5" style={{ background: PAPER_RED_HEX }} />
      {children}
    </div>
  );
}

export function PaperCoverHeader({
  company,
  kind,
  number,
}: {
  company: CompanySettings;
  kind: PaperKind;
  number: string;
}) {
  const lines = paperCompanyLines(company);
  const logoUrl = company.logoUrl?.trim();
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-4">
      <div className="flex min-w-0 items-start gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-10 w-auto max-w-[7rem] shrink-0 object-contain object-left" />
        ) : null}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{lines.name}</p>
          {lines.address.map((line) => (
            <p key={line} className="text-xs leading-relaxed" style={{ color: PAPER_MUTED_HEX }}>
              {line}
            </p>
          ))}
          {lines.contactLines.map((line) => (
            <p key={line} className="text-xs leading-relaxed" style={{ color: PAPER_MUTED_HEX }}>
              {line}
            </p>
          ))}
          {lines.license ? (
            <p className="text-[11px]" style={{ color: PAPER_MUTED_HEX }}>
              {lines.license}
            </p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[22px] font-bold tracking-wide">{paperKindLabel(kind)}</p>
        <p className="mt-0.5 text-sm" style={{ color: PAPER_RED_HEX }}>
          No. {number}
        </p>
      </div>
    </div>
  );
}

export function PaperSiteTitle({ title, locality }: { title: string; locality?: string }) {
  return (
    <div>
      <h2 className="text-[26px] leading-tight font-semibold text-balance">{title}</h2>
      {locality ? (
        <p className="mt-1 text-sm" style={{ color: PAPER_MUTED_HEX }}>
          {locality}
        </p>
      ) : null}
    </div>
  );
}

export function PaperMetaRow({ items }: { items: PaperMetaItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: PAPER_MUTED_HEX }}>
            {item.label}
          </p>
          <p className="mt-0.5 text-sm font-semibold">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function PaperPartyCards({
  left,
  right,
}: {
  left: { label: string; name: string; lines?: string[] };
  right?: { label: string; name: string; lines?: string[] } | null;
}) {
  const cards = right ? [left, right] : [left];
  return (
    <div className={cn("grid gap-3", cards.length > 1 && "sm:grid-cols-2")}>
      {cards.map((card) => (
        <div key={card.label} className="rounded-md px-3.5 py-3" style={{ background: PAPER_CARD_HEX }}>
          <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: PAPER_MUTED_HEX }}>
            {card.label}
          </p>
          <p className="mt-1 text-[15px] font-semibold">{card.name || "—"}</p>
          {card.lines?.filter(Boolean).map((line) => (
            <p key={line} className="text-xs" style={{ color: PAPER_MUTED_HEX }}>
              {line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export function paperManagerCard(manager: ProjectManagerContact | null | undefined) {
  const name = manager?.name.trim() || "";
  const phone = formatPhone(manager?.phone);
  return {
    label: "Project manager",
    name: name || "—",
    lines: name
      ? [manager?.title.trim() || "Project Manager", [phone !== "—" ? phone : "", manager?.email.trim() || ""].filter(Boolean).join(" · ")]
      : [],
  };
}

export function PaperTableHead({ hidePrices }: { hidePrices?: boolean }) {
  return (
    <div
      className="grid gap-2 border-b pb-2 text-[10px] font-semibold tracking-[0.14em] uppercase"
      style={{
        color: PAPER_MUTED_HEX,
        gridTemplateColumns: hidePrices ? "minmax(0,1fr) 3rem 3.5rem" : "minmax(0,1fr) 3rem 3.5rem 5.5rem 5.5rem",
      }}
    >
      <span>Description</span>
      <span className="text-right">Qty</span>
      <span className="text-right">Unit</span>
      {hidePrices ? null : (
        <>
          <span className="text-right">Rate</span>
          <span className="text-right">Amount</span>
        </>
      )}
    </div>
  );
}

export function PaperTableRow({
  heading,
  detail,
  qty,
  unit,
  rate,
  amount,
  hidePrices,
  muted,
  extra,
}: {
  heading: ReactNode;
  detail?: ReactNode;
  qty: string;
  unit: string;
  rate?: string;
  amount?: string;
  hidePrices?: boolean;
  muted?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div
      className={cn("grid items-start gap-2 py-3", muted && "opacity-70")}
      style={{
        gridTemplateColumns: hidePrices ? "minmax(0,1fr) 3rem 3.5rem" : "minmax(0,1fr) 3rem 3.5rem 5.5rem 5.5rem",
      }}
    >
      <div className="min-w-0">
        <div className="text-[15px] leading-6">{heading}</div>
        {detail}
        {extra}
      </div>
      <p className="pt-0.5 text-right text-sm tabular-nums">{qty}</p>
      <p className="pt-0.5 text-right text-sm">{unit}</p>
      {hidePrices ? null : (
        <>
          <p className="pt-0.5 text-right text-sm tabular-nums">{rate}</p>
          <p className="pt-0.5 text-right text-sm font-medium tabular-nums">{amount}</p>
        </>
      )}
    </div>
  );
}

export function PaperTotals({
  rows,
  pill,
}: {
  rows: Array<{ label: string; value: string }>;
  pill: { label: string; value: string };
}) {
  return (
    <div className="ml-auto w-full max-w-[17rem] space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4 text-sm" style={{ color: PAPER_MUTED_HEX }}>
          <span>{row.label}</span>
          <span className="tabular-nums">{row.value}</span>
        </div>
      ))}
      <div
        className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold text-white"
        style={{ background: PAPER_INK_HEX }}
      >
        <span>{pill.label}</span>
        <span className="tabular-nums">{pill.value}</span>
      </div>
    </div>
  );
}

export function PaperSignCue({ pageLabel }: { pageLabel: string }) {
  return (
    <p className="text-right text-xs font-semibold tracking-wide uppercase" style={{ color: PAPER_RED_HEX }}>
      Sign on {pageLabel} →
    </p>
  );
}

export function PaperSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: PAPER_MUTED_HEX }}>
      {children}
    </h3>
  );
}

export function PaperFooter({ company }: { company: CompanySettings }) {
  return (
    <p className="border-t pt-3 text-[11px]" style={{ color: PAPER_MUTED_HEX }}>
      {paperFooterLeft(company)}
    </p>
  );
}

export function PaperTermsColumns({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl space-y-3 text-[15px] leading-7">{children}</div>;
}
