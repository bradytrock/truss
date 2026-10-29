"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { EstimateAddLine } from "@/components/estimate-add-line";
import { EstimateLinePhotos } from "@/components/estimate-line-photos";
import { CommitInput } from "@/components/commit-input";
import { FormattedTextEditor } from "@/components/formatted-text-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTIMATE_PACKAGES,
  PACKAGE_LABEL,
  linePackageFromSelect,
  linePackageSelectValue,
  parseLinePackage,
} from "@/lib/estimate-packages";
import { COMMON_UNITS, includedLines, lineAmount, roundMoney } from "@/lib/estimate-totals";
import { formatMoney } from "@/lib/format";
import { firstPlainLine } from "@/lib/line-format";
import { moneyAmount } from "@/lib/money-input";
import type { EstimateLine, JobPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_GRID =
  "md:grid-cols-[minmax(0,1fr)_6.75rem_7.25rem_6.5rem_6.75rem_2rem]";

const QUIET_INPUT =
  "h-7 rounded-sm border-0 bg-transparent px-1 shadow-none focus-visible:bg-muted/60 focus-visible:ring-0 disabled:pointer-events-auto disabled:bg-transparent disabled:text-foreground disabled:opacity-100";

export type SectionLinePatch = Partial<
  Pick<
    EstimateLine,
    | "title"
    | "description"
    | "quantity"
    | "unit"
    | "unitCost"
    | "optional"
    | "selected"
    | "taxable"
    | "package"
  >
>;

export function sectionIncludedTotal(lines: EstimateLine[]) {
  return roundMoney(includedLines(lines).reduce((sum, line) => sum + lineAmount(line), 0));
}

export function sectionSubline(lines: EstimateLine[], isOption: boolean) {
  if (lines.length === 0) return "No items yet";
  const optional = lines.filter((line) => line.optional).length;
  if (optional === lines.length) return "Optional add-ons · homeowner chooses at signing";
  const items = `${lines.length} item${lines.length === 1 ? "" : "s"}`;
  const bits = [items];
  if (optional > 0) bits.push(`${optional} optional`);
  if (isOption) bits.push("one of the options on this proposal");
  return bits.join(" · ");
}

export function EstimateSectionCard({
  name,
  lines,
  editable,
  optionalOpen,
  showTax,
  showPackage,
  isOption,
  galleryPhotos,
  galleryHint,
  onRename,
  onPatchLine,
  onMoveLine,
  onRemoveLine,
  onPhotosChange,
  onAddCatalog,
  onAddCustom,
  onBrowse,
  onBuildOption,
  onRemoveSection,
}: {
  name: string;
  lines: EstimateLine[];
  editable: boolean;
  /** Optional lines can still be checked on a sent proposal. */
  optionalOpen: boolean;
  showTax: boolean;
  showPackage: boolean;
  isOption: boolean;
  galleryPhotos: JobPhoto[];
  galleryHint?: string;
  onRename: (name: string) => void;
  onPatchLine: (id: string, patch: SectionLinePatch) => void;
  onMoveLine: (id: string, direction: "up" | "down") => void;
  onRemoveLine: (id: string) => void;
  onPhotosChange: (id: string, photoIds: string[]) => void;
  onAddCatalog: (catalogItemId: string) => void | Promise<void>;
  onAddCustom: (title: string) => void | Promise<void>;
  onBrowse: () => void;
  onBuildOption?: () => void;
  onRemoveSection: () => void;
}) {
  const total = sectionIncludedTotal(lines);
  const allOptional = lines.length > 0 && lines.every((line) => line.optional);

  function setAllOptional(optional: boolean) {
    for (const line of lines) {
      if (line.optional === optional) continue;
      onPatchLine(line.id, { optional, selected: optional ? line.selected : true });
    }
  }

  return (
    <section className="rounded-[12px] border bg-card">
      <header className="flex items-start gap-3 px-4 pt-3 pb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CommitInput
              aria-label="Section name"
              className={cn(QUIET_INPUT, "-ml-1 max-w-xs text-[15px] font-semibold")}
              disabled={!editable}
              value={name}
              onCommit={(value) => onRename(value.trim() || "Items")}
            />
            {isOption ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Option
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{sectionSubline(lines, isOption)}</p>
        </div>
        <p className="pt-1 text-[15px] font-semibold tabular-nums">{formatMoney(total)}</p>
        {editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="icon-sm" variant="ghost" aria-label={`${name} section actions`} />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onBuildOption ? (
                <DropdownMenuItem onClick={onBuildOption}>
                  <Copy />
                  Build another option from this
                </DropdownMenuItem>
              ) : null}
              {lines.length > 0 ? (
                <DropdownMenuItem onClick={() => setAllOptional(!allOptional)}>
                  {allOptional ? "Always include every item" : "Mark every item optional"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  if (
                    lines.length > 0 &&
                    !window.confirm(`Remove ${name} and its ${lines.length} item${lines.length === 1 ? "" : "s"}?`)
                  ) {
                    return;
                  }
                  onRemoveSection();
                }}
              >
                <Trash2 />
                Remove section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <div
        className={cn(
          "hidden items-center gap-x-3 border-y bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase md:grid",
          ROW_GRID,
        )}
      >
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span className="text-right">Total</span>
        <span className="text-right">Include</span>
        <span />
      </div>

      {lines.length === 0 ? (
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">
          {editable ? "Nothing in this section yet. Add from the price book below." : "No items in this section."}
        </p>
      ) : (
        <ul>
          {lines.map((line, index) => (
            <SectionLineRow
              key={line.id}
              line={line}
              editable={editable}
              optionalOpen={optionalOpen}
              showTax={showTax}
              showPackage={showPackage}
              first={index === 0}
              last={index === lines.length - 1}
              galleryPhotos={galleryPhotos}
              galleryHint={galleryHint}
              onPatch={(patch) => onPatchLine(line.id, patch)}
              onMove={(direction) => onMoveLine(line.id, direction)}
              onRemove={() => onRemoveLine(line.id)}
              onPhotosChange={(photoIds) => onPhotosChange(line.id, photoIds)}
            />
          ))}
        </ul>
      )}

      {editable ? (
        <footer className="flex items-center gap-2 rounded-b-[12px] border-t bg-muted/20 px-3 py-2">
          <div className="min-w-0 flex-1">
            <EstimateAddLine
              placeholder="Add from price book or type a custom item"
              onPickCatalog={onAddCatalog}
              onCustom={onAddCustom}
              onBrowse={onBrowse}
            />
          </div>
          {lines.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setAllOptional(!allOptional)}
            >
              {allOptional ? "Always include" : "Mark optional"}
            </Button>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

function SectionLineRow({
  line,
  editable,
  optionalOpen,
  showTax,
  showPackage,
  first,
  last,
  galleryPhotos,
  galleryHint,
  onPatch,
  onMove,
  onRemove,
  onPhotosChange,
}: {
  line: EstimateLine;
  editable: boolean;
  optionalOpen: boolean;
  showTax: boolean;
  showPackage: boolean;
  first: boolean;
  last: boolean;
  galleryPhotos: JobPhoto[];
  galleryHint?: string;
  onPatch: (patch: SectionLinePatch) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onPhotosChange: (photoIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const units = COMMON_UNITS.includes(line.unit) ? COMMON_UNITS : [line.unit, ...COMMON_UNITS];
  const excluded = line.optional && !line.selected;
  const preview = firstPlainLine(line.description);
  const photoCount = line.photoIds?.length || line.photos?.length || 0;
  const amount = lineAmount(line);
  const canTouchOptional = line.optional && optionalOpen;

  const qtyAndUnit = editable ? (
    <span className="inline-flex items-center justify-end">
      <CommitInput
        type="number"
        min={0}
        step="0.01"
        aria-label="Quantity"
        className={cn(QUIET_INPUT, "w-[3.6rem] text-right tabular-nums")}
        value={line.quantity}
        onCommit={(value) => onPatch({ quantity: Number(value) || 0 })}
      />
      <Select
        value={line.unit}
        onValueChange={(value) => onPatch({ unit: String(value ?? line.unit) })}
        items={units.map((unit) => ({ value: unit, label: unit.toUpperCase() }))}
      >
        <SelectTrigger
          size="sm"
          aria-label="Unit"
          className="h-7 w-fit gap-0.5 border-0 bg-transparent px-1 text-xs shadow-none hover:bg-muted/60 [&_svg]:size-3"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit} value={unit}>
              {unit.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  ) : (
    <span className="text-sm tabular-nums">
      {line.quantity} {line.unit.toUpperCase()}
    </span>
  );

  const unitPrice = (
    <CurrencyInput
      disabled={!editable}
      aria-label="Unit price"
      className={cn(QUIET_INPUT, "w-full text-right tabular-nums")}
      value={line.unitCost}
      onCommit={(text) => {
        const unitCost = moneyAmount(text) ?? 0;
        if (unitCost !== line.unitCost) onPatch({ unitCost });
      }}
    />
  );

  const include = line.optional ? (
    <label
      className={cn(
        "inline-flex items-center justify-end gap-1.5 text-xs",
        canTouchOptional ? "cursor-pointer" : "cursor-default",
        excluded ? "text-muted-foreground" : "text-foreground",
      )}
    >
      <Checkbox
        checked={line.selected}
        disabled={!canTouchOptional}
        onCheckedChange={(value) => onPatch({ selected: Boolean(value) })}
        aria-label={`Include ${line.title || "item"} in the total`}
      />
      {excluded ? "Excluded" : "Included"}
    </label>
  ) : editable ? (
    <button
      type="button"
      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      title="Make this item optional"
      onClick={() => onPatch({ optional: true, selected: true })}
    >
      Always
    </button>
  ) : (
    <span className="text-xs text-muted-foreground">Always</span>
  );

  return (
    <li
      className={cn("group/row border-t md:first:border-t-0", excluded && "bg-muted/20")}
    >
      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2", ROW_GRID)}>
        <div className="min-w-0">
          <CommitInput
            aria-label="Item"
            placeholder="Item name"
            disabled={!editable}
            className={cn(QUIET_INPUT, "-ml-1 w-full text-sm font-medium", excluded && "text-muted-foreground")}
            value={line.title}
            onCommit={(value) => onPatch({ title: value })}
          />
          <button
            type="button"
            className="-ml-px flex max-w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="truncate">
              {preview ||
                (photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : editable ? "Add a description" : "No description")}
            </span>
            <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        <div className="hidden justify-end md:flex">{qtyAndUnit}</div>
        <div className="hidden md:block">{unitPrice}</div>
        <p
          className={cn(
            "text-right text-sm font-semibold tabular-nums",
            excluded && "font-normal text-muted-foreground line-through",
          )}
        >
          {formatMoney(amount)}
        </p>
        <div className="hidden justify-end md:flex">{include}</div>
        <div className="hidden justify-end md:flex">
          {editable ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`${line.title || "Item"} actions`}
                    className="text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setOpen((value) => !value)}>
                  {open ? "Hide details" : "Details, photos & tax"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={first} onClick={() => onMove("up")}>
                  <ArrowUp />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onClick={() => onMove("down")}>
                  <ArrowDown />
                  Move down
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onPatch(line.optional ? { optional: false, selected: true } : { optional: true, selected: true })
                  }
                >
                  {line.optional ? "Always include" : "Make optional"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                  <Trash2 />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 md:hidden">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Qty {qtyAndUnit}
        </span>
        <span className="flex w-36 items-center gap-1 text-xs text-muted-foreground">
          Price {unitPrice}
        </span>
        <span className="ml-auto">{include}</span>
        {editable ? (
          <span className="flex">
            <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={first} onClick={() => onMove("up")}>
              <ArrowUp />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={last} onClick={() => onMove("down")}>
              <ArrowDown />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Remove item" onClick={onRemove}>
              <Trash2 />
            </Button>
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">What the homeowner reads under the title</Label>
            <FormattedTextEditor
              value={line.description}
              disabled={!editable}
              placeholder="Lifetime limited warranty · Charcoal"
              onCommit={(value) => onPatch({ description: value })}
            />
          </div>
          {showTax || showPackage ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {showTax ? (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={line.taxable}
                    disabled={!editable}
                    onCheckedChange={(value) => onPatch({ taxable: Boolean(value) })}
                  />
                  Taxable
                </label>
              ) : null}
              {showPackage ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Option</Label>
                  {editable ? (
                    <Select
                      value={linePackageSelectValue(line.package)}
                      onValueChange={(value) => onPatch({ package: linePackageFromSelect(String(value ?? "all")) })}
                      items={[
                        { value: "all", label: "Shared work" },
                        ...ESTIMATE_PACKAGES.map((pkg) => ({ value: pkg, label: PACKAGE_LABEL[pkg] })),
                        ...(parseLinePackage(line.package) &&
                        !ESTIMATE_PACKAGES.includes(
                          parseLinePackage(line.package) as (typeof ESTIMATE_PACKAGES)[number],
                        )
                          ? [{ value: parseLinePackage(line.package), label: parseLinePackage(line.package) }]
                          : []),
                      ]}
                    >
                      <SelectTrigger size="sm" className="w-[9.5rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Shared work</SelectItem>
                        {ESTIMATE_PACKAGES.map((pkg) => (
                          <SelectItem key={pkg} value={pkg}>
                            {PACKAGE_LABEL[pkg]}
                          </SelectItem>
                        ))}
                        {parseLinePackage(line.package) &&
                        !ESTIMATE_PACKAGES.includes(
                          parseLinePackage(line.package) as (typeof ESTIMATE_PACKAGES)[number],
                        ) ? (
                          <SelectItem value={parseLinePackage(line.package)}>{parseLinePackage(line.package)}</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>{parseLinePackage(line.package) || "Shared work"}</span>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
          <EstimateLinePhotos
            line={{ photoIds: line.photoIds ?? [], photos: line.photos }}
            gallery={galleryPhotos}
            emptyHint={galleryHint}
            editable={editable}
            onChange={editable ? onPhotosChange : undefined}
          />
        </div>
      ) : null}
    </li>
  );
}
