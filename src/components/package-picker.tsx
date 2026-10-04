"use client";

import { Check } from "lucide-react";
import {
  gbbBanner,
  gbbCardIdentity,
  gbbCardOrder,
  gbbFeatureRows,
  gbbMonthlyAbout,
  gbbNoteFromIntro,
  gbbPriceNote,
  isGbbEstimate,
  listEstimateOptions,
  resolveSelectedPackage,
  type EstimateOption,
  type EstimatePackage,
} from "@/lib/estimate-packages";
import { totalsForPackage } from "@/lib/estimate-totals";
import type { ProjectManagerContact } from "@/lib/document-owner";
import { formatCurrencyFull, formatPhone, initials } from "@/lib/format";
import type { Estimate, EstimateLine } from "@/lib/types";
import { cn } from "@/lib/utils";

const INK = "#1a2332";
const ORANGE = "#e07a24";
const GREEN = "#1f9d55";
const MUTED = "#6f6a62";
const LINE = "#e4dfd6";
const BAND = "#f3f1ec";

type PackagePickerEstimate = Pick<
  Estimate,
  "taxRate" | "discountKind" | "discountValue" | "depositKind" | "depositValue"
> &
  Partial<Pick<Estimate, "packageMode" | "selectedPackage" | "subtotalOverride" | "marginPercent">>;

type PackagePickerLine = Pick<
  EstimateLine,
  "quantity" | "unitCost" | "optional" | "selected" | "taxable"
> &
  Partial<
    Pick<EstimateLine, "package" | "groupName" | "title" | "description" | "sortOrder">
  >;

export function PackagePicker({
  estimate,
  lines,
  pending,
  locked,
  onSelect,
  note,
  manager,
  className,
}: {
  estimate: PackagePickerEstimate;
  lines: PackagePickerLine[];
  pending?: EstimateOption[];
  locked?: boolean;
  onSelect?: (pkg: EstimatePackage) => void;
  /** Cover note. A short first line becomes the card heading. */
  note?: string | null;
  manager?: ProjectManagerContact | null;
  className?: string;
}) {
  if (!isGbbEstimate(estimate)) return null;
  const options = listEstimateOptions(lines, pending);
  if (options.length === 0) return null;
  const selected = resolveSelectedPackage(estimate, lines, pending);
  const totalFor = (key: string) => totalsForPackage(estimate, lines, key).total;
  const ordered = gbbCardOrder(options, totalFor);
  const features = gbbFeatureRows(lines, ordered.map((option) => option.key));
  const aside = gbbNoteFromIntro(note);
  const managerName = manager?.name.trim() ?? "";
  const phone = formatPhone(manager?.phone);
  const phoneLine = phone && phone !== "—" ? phone : "";
  const columns = ordered.length >= 3 ? "lg:grid-cols-3" : ordered.length === 2 ? "sm:grid-cols-2" : "";

  return (
    <div className={cn("rounded-2xl px-3 py-5 sm:px-4", className)} style={{ background: BAND }}>
      <div className={cn("grid items-stretch gap-4 pt-3", columns, ordered.length === 1 && "max-w-md")}>
        {ordered.map((option) => {
          const identity = gbbCardIdentity(option.key, lines, option.name);
          const banner = gbbBanner(option.key, ordered, totalFor);
          const popular = banner.tone === "popular";
          const active = option.key === selected;
          const total = totalFor(option.key);
          const monthly = gbbMonthlyAbout(total);
          const priceNote = gbbPriceNote(option.key, ordered, totalFor);
          return (
            <div key={option.key} className="relative flex h-full">
              <p
                className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-3.5 py-1 text-[10px] font-bold tracking-[0.16em] whitespace-nowrap text-white uppercase"
                style={{ background: popular ? ORANGE : INK }}
              >
                {banner.label}
              </p>
              <article
                className="flex h-full w-full flex-col rounded-[16px] bg-white px-5 pt-7 pb-5"
                data-gbb-option={option.key}
                data-selected={active ? "true" : "false"}
                style={{
                  border: popular ? `2px solid ${INK}` : `1px solid ${LINE}`,
                  boxShadow: popular
                    ? "0 12px 28px rgba(26, 35, 50, 0.08)"
                    : "0 1px 2px rgba(26, 35, 50, 0.05)",
                }}
              >
                {identity.grade ? (
                  <p
                    className="text-[11px] font-semibold tracking-[0.16em] uppercase"
                    style={{ color: MUTED }}
                  >
                    {identity.grade}
                  </p>
                ) : null}
                <h3 className="text-[1.55rem] leading-tight font-bold tracking-tight" style={{ color: INK }}>
                  {identity.title}
                </h3>
                <p className="mt-1 text-sm leading-snug" style={{ color: MUTED }}>
                  {identity.tagline}
                </p>
                <p className="mt-4 flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className="text-[2.05rem] leading-none font-extrabold tracking-tight tabular-nums" style={{ color: INK }}>
                    {formatCurrencyFull(total)}
                  </span>
                  <span className="text-sm" style={{ color: MUTED }}>
                    total
                  </span>
                </p>
                {monthly != null ? (
                  <p className="mt-1 text-sm" style={{ color: MUTED }} title="Illustrative payment, about 84 months on approved credit.">
                    or about {formatCurrencyFull(monthly)}/mo
                  </p>
                ) : (
                  <p className="mt-1 text-sm" style={{ color: MUTED }}>
                    &nbsp;
                  </p>
                )}
                {priceNote?.kind === "delta" ? (
                  <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: GREEN }}>
                    +{formatCurrencyFull(priceNote.amount)} vs {priceNote.versus}
                  </p>
                ) : priceNote?.kind === "start" ? (
                  <p className="mt-0.5 text-sm" style={{ color: MUTED }}>
                    Starting point
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm">&nbsp;</p>
                )}
                {features.length > 0 ? (
                  <ul className="mt-4 flex-1 space-y-2">
                    {features.map((row) => {
                      const included = Boolean(row.labels[option.key]);
                      const text = row.labels[option.key] ?? row.canonical;
                      return (
                        <li
                          key={row.key}
                          className="flex items-start gap-2 text-sm leading-snug"
                          style={{ color: INK }}
                        >
                          {included ? (
                            <Check
                              className="mt-0.5 size-4 shrink-0"
                              style={{ color: GREEN }}
                              strokeWidth={2.6}
                              aria-hidden
                            />
                          ) : (
                            <span
                              className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-[13px] leading-none"
                              style={{ color: "#b0aaa2" }}
                              aria-hidden
                            >
                              —
                            </span>
                          )}
                          <span>{text}</span>
                          <span className="sr-only">{included ? "Included." : "Not included."}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex-1" />
                )}
                <button
                  type="button"
                  disabled={locked || !onSelect}
                  aria-pressed={active}
                  onClick={() => onSelect?.(option.key)}
                  className={cn(
                    "mt-5 h-11 w-full rounded-[10px] text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default",
                    !active && "hover:bg-[#f7f5f1]",
                  )}
                  style={{
                    background: active ? INK : "#fff",
                    color: active ? "#fff" : INK,
                    border: `1.5px solid ${INK}`,
                    outlineColor: INK,
                    opacity: locked && !active ? 0.72 : 1,
                  }}
                >
                  {`Choose ${identity.chooseLabel}`}
                </button>
              </article>
            </div>
          );
        })}
      </div>
      {aside || managerName ? (
        <div
          className={cn(
            "mt-4 grid gap-3",
            aside && managerName && "lg:grid-cols-[minmax(0,1.35fr)_minmax(18.5rem,0.9fr)]",
          )}
        >
          {aside ? (
            <aside className="rounded-[16px] bg-white px-5 py-4" style={{ border: `1px solid ${LINE}` }}>
              <h3 className="text-[15px] font-bold" style={{ color: INK }}>
                {aside.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: MUTED }}>
                {aside.body}
              </p>
            </aside>
          ) : null}
          {managerName ? (
            <aside
              className="flex items-center gap-3 rounded-[16px] bg-white px-4 py-4"
              style={{ border: `1px solid ${LINE}` }}
            >
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: INK }}
                aria-hidden
              >
                {initials(managerName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold" style={{ color: INK }}>
                  {managerName}
                </p>
                <p className="text-sm leading-snug" style={{ color: MUTED }}>
                  {manager?.title.trim() || "Project Manager"} · questions? Text me anytime
                </p>
                {phoneLine ? (
                  <a
                    href={`tel:${(manager?.phone ?? "").replace(/[^\d+]/g, "")}`}
                    className="mt-0.5 block text-sm font-medium"
                    style={{ color: INK }}
                  >
                    {phoneLine}
                  </a>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
