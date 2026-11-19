import type { ReactNode } from "react";
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
  type PaperPartyCard,
} from "@/lib/document-paper";
import { customerUnitLabel } from "@/lib/line-format";
import { cn } from "@/lib/utils";
import type { CompanySettings } from "@/lib/types";

export { paperManagerCard } from "@/lib/document-paper";

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
  phone,
  email,
}: {
  company: CompanySettings;
  kind: PaperKind;
  number: string;
  /** Direct line for the header. Estimates and invoices use the project manager. */
  phone?: string | null;
  email?: string | null;
}) {
  const lines = paperCompanyLines({
    ...company,
    phone: phone?.trim() || company.phone,
    email: email?.trim() || company.email,
  });
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
          {lines.contact ? (
            <p className="text-xs leading-relaxed" style={{ color: PAPER_MUTED_HEX }}>
              {lines.contact}
            </p>
          ) : null}
          {lines.license ? (
            <p className="text-[11px]" style={{ color: PAPER_MUTED_HEX }}>
              {lines.license}
            </p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[15px] font-bold tracking-wide">{paperKindLabel(kind)}</p>
        <p className="mt-0.5 text-sm" style={{ color: PAPER_RED_HEX }}>
          {number}
        </p>
      </div>
    </div>
  );
}

export function PaperSiteTitle({ title, locality }: { title: string; locality?: string }) {
  return (
    <div>
      <h2 className="text-[18px] leading-tight font-semibold text-balance">{title}</h2>
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
  left: PaperPartyCard;
  right?: PaperPartyCard | null;
}) {
  const cards = right ? [left, right] : [left];
  return (
    <div className={cn("grid items-stretch gap-3", cards.length > 1 && "sm:grid-cols-2")}>
      {cards.map((card) => (
        <div key={card.label} className="overflow-hidden rounded-md border border-[#d6d6d6] bg-white">
          <div className="h-[3px]" style={{ background: PAPER_RED_HEX }} />
          <div className="px-3.5 py-3">
            <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: PAPER_MUTED_HEX }}>
              {card.label}
            </p>
            <div className="mt-2">
              {card.people.map((person, index) => (
                <div
                  key={`${person.name}-${index}`}
                  className={cn(index > 0 && "mt-3 border-t border-[#e4e4e4] pt-3")}
                >
                  <p className="text-[15px] leading-5 font-semibold">{person.name || "—"}</p>
                  {person.detail.map((line) => (
                    <p key={line} className="text-xs leading-5">
                      {line}
                    </p>
                  ))}
                  {person.rows.map((row) => (
                    <p key={`${row.label}-${row.value}`} className="text-xs leading-5">
                      <span
                        className="mr-2 text-[10px] font-semibold tracking-[0.12em] uppercase"
                        style={{ color: PAPER_MUTED_HEX }}
                      >
                        {row.label}
                      </span>
                      <span>{row.value}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Qty, unit, rate, and amount are fixed tracks. On a phone they consume the row,
// the description track collapses, and each word lands on its own line. Stay
// stacked until the sheet is wide enough for the table.
function paperTableColumns(hidePrices?: boolean) {
  return hidePrices
    ? "@lg:grid-cols-[minmax(0,1fr)_3rem_3.5rem]"
    : "@lg:grid-cols-[minmax(0,1fr)_3rem_3.5rem_5.5rem_5.5rem]";
}

export function PaperTableHead({ hidePrices }: { hidePrices?: boolean }) {
  return (
    <div className="@container">
      <div
        className={cn(
          "hidden gap-2 rounded-sm py-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase @lg:grid",
          paperTableColumns(hidePrices),
        )}
        style={{ color: PAPER_MUTED_HEX, background: PAPER_CARD_HEX }}
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
  const unitLabel = customerUnitLabel(unit);
  return (
    <div className={cn("@container", muted && "opacity-70")}>
      <div className={cn("grid w-full min-w-0 items-start gap-2 py-3", paperTableColumns(hidePrices))}>
        <div className="min-w-0 break-words">
          <div className="text-[15px] leading-6">{heading}</div>
          {detail}
          <PaperMobileFacts
            qty={qty}
            unitLabel={unitLabel}
            rate={rate}
            amount={amount}
            hidePrices={hidePrices}
          />
        </div>
        <p className="hidden pt-0.5 text-right text-sm tabular-nums @lg:block">{qty}</p>
        <p className="hidden pt-0.5 text-right text-sm @lg:block">{unitLabel}</p>
        {hidePrices ? null : (
          <>
            <p className="hidden pt-0.5 text-right text-sm tabular-nums @lg:block">{rate}</p>
            <p className="hidden pt-0.5 text-right text-sm font-medium tabular-nums @lg:block">{amount}</p>
          </>
        )}
        {extra ? <div className="col-span-full min-w-0">{extra}</div> : null}
      </div>
    </div>
  );
}

function PaperMobileFacts({
  qty,
  unitLabel,
  rate,
  amount,
  hidePrices,
}: {
  qty: string;
  unitLabel: string;
  rate?: string;
  amount?: string;
  hidePrices?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm @lg:hidden">
      <p className="min-w-0" style={{ color: PAPER_MUTED_HEX }}>
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase">Qty</span>{" "}
        <span className="tabular-nums" style={{ color: PAPER_INK_HEX }}>
          {qty}
          {unitLabel ? ` ${unitLabel}` : ""}
        </span>
        {!hidePrices && rate ? (
          <span className="tabular-nums" style={{ color: PAPER_INK_HEX }}>
            {" "}
            · {rate}
          </span>
        ) : null}
      </p>
      {!hidePrices && amount ? (
        <p className="ml-auto shrink-0 font-medium tabular-nums">{amount}</p>
      ) : null}
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

export function PaperPageTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[15px] font-bold tracking-wide">{children}</h3>;
}

export function PaperFooter({ company }: { company: CompanySettings }) {
  return (
    <p className="border-t pt-3 text-[11px]" style={{ color: PAPER_MUTED_HEX }}>
      {paperFooterLeft(company)}
    </p>
  );
}

export function PaperTermsColumns({ children }: { children: ReactNode }) {
  return (
    <div className="columns-1 gap-x-8 text-[13px] leading-5 sm:columns-2 [column-fill:_auto]">
      {children}
    </div>
  );
}
