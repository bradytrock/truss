"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { formatDateShort, formatMoney } from "@/lib/format";
import { vendorFeedbackFor, vendorPricesFor } from "@/lib/vendor-profile";
import type { VendorBookRow } from "@/lib/vendor-book";

export function VendorProfilePanel({ row }: { row: VendorBookRow }) {
  const crm = useCrm();
  const profile = (crm.book.vendorProfiles ?? []).find((item) => item.id === row.profileId);
  const feedback = useMemo(
    () => (profile ? vendorFeedbackFor(profile.id, crm.book.vendorFeedback ?? []) : []),
    [crm.book.vendorFeedback, profile],
  );
  const prices = useMemo(
    () => (profile ? vendorPricesFor(profile.id, crm.book.vendorPrices ?? []) : []),
    [crm.book.vendorPrices, profile],
  );
  const [notes, setNotes] = useState(row.internalNotes);
  const [noteBusy, setNoteBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [priceName, setPriceName] = useState("");
  const [priceUnit, setPriceUnit] = useState("EA");
  const [priceCost, setPriceCost] = useState("");
  const [priceNotes, setPriceNotes] = useState("");

  useEffect(() => {
    setNotes(row.internalNotes);
  }, [row.id, row.internalNotes]);

  async function saveNotes() {
    setNoteBusy(true);
    try {
      const saved = await crm.updateVendorProfileNotes(row.name, notes);
      if (saved) toast.success("Notes saved for the company");
    } finally {
      setNoteBusy(false);
    }
  }

  async function saveFeedback() {
    const saved = await crm.addVendorFeedback(row.name, comment);
    if (saved) {
      setComment("");
      toast.success("Feedback posted");
    }
  }

  async function savePrice() {
    if (!priceName.trim()) {
      toast.error("Name the price item.");
      return;
    }
    const saved = await crm.addVendorPrice(row.name, {
      name: priceName,
      unit: priceUnit,
      unitCost: Number(priceCost) || 0,
      notes: priceNotes,
    });
    if (saved) {
      setPriceName("");
      setPriceUnit("EA");
      setPriceCost("");
      setPriceNotes("");
      toast.success("Price added");
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Company notes</SectionLabel>
        <p className="mb-2 text-xs text-[#6e6e73]">Visible to everyone at this company.</p>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Preferred reps, lead times, dumpster placement, insurance, anything the crew should know."
          className="min-h-[110px] rounded-xl"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-[#a1a1a6]">
            {profile?.updatedBy
              ? `Last saved by ${profile.updatedBy}${profile.updatedAt ? ` · ${formatDateShort(profile.updatedAt)}` : ""}`
              : "Not saved yet"}
          </p>
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-[#1d1d1f] text-white hover:bg-black"
            disabled={noteBusy || notes === row.internalNotes}
            onClick={() => void saveNotes()}
          >
            Save notes
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Feedback</SectionLabel>
        <p className="mb-2 text-xs text-[#6e6e73]">How they showed up on jobs — for the next person who hires them.</p>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="On time, clean, price held, or what went wrong."
          className="min-h-[72px] rounded-xl"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-lg"
            disabled={!comment.trim()}
            onClick={() => void saveFeedback()}
          >
            Post feedback
          </Button>
        </div>
        {feedback.length === 0 ? (
          <p className="mt-3 text-sm text-[#6e6e73]">No feedback yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {feedback.map((item) => (
              <li key={item.id} className="rounded-xl bg-[#f7f6f3] px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-[#6e6e73]">
                    {item.createdBy || "Crew"}
                    {item.createdAt ? ` · ${formatDateShort(item.createdAt)}` : ""}
                  </p>
                  <button
                    type="button"
                    className="text-[#a1a1a6] hover:text-[#8a2f22]"
                    aria-label="Remove feedback"
                    onClick={() => void crm.removeVendorFeedback(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#1d1d1f]">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel>Pricing</SectionLabel>
        <p className="mb-2 text-xs text-[#6e6e73]">Negotiated rates the office and field can both see.</p>
        {prices.length === 0 ? (
          <p className="mb-3 text-sm text-[#6e6e73]">No prices on file.</p>
        ) : (
          <ul className="mb-3 overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(28,25,22,0.08)]">
            {prices.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-[rgba(28,25,22,0.06)] px-3.5 py-2.5 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1d1d1f]">{item.name}</p>
                  {item.notes.trim() ? (
                    <p className="truncate text-xs text-[#6e6e73]">{item.notes}</p>
                  ) : null}
                </div>
                <p className="text-sm tabular-nums text-[#1d1d1f]">
                  {formatMoney(item.unitCost)}
                  <span className="text-[#6e6e73]">/{item.unit}</span>
                </p>
                <button
                  type="button"
                  className="text-[#a1a1a6] hover:text-[#8a2f22]"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => void crm.removeVendorPrice(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem]">
          <Input value={priceName} onChange={(event) => setPriceName(event.target.value)} placeholder="Item" />
          <Input value={priceUnit} onChange={(event) => setPriceUnit(event.target.value)} placeholder="Unit" />
          <Input
            value={priceCost}
            onChange={(event) => setPriceCost(event.target.value)}
            placeholder="Cost"
            inputMode="decimal"
          />
        </div>
        <Input
          className="mt-2"
          value={priceNotes}
          onChange={(event) => setPriceNotes(event.target.value)}
          placeholder="Notes (optional)"
        />
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => void savePrice()}>
            <Plus />
            Add price
          </Button>
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-1 text-[11px] font-semibold tracking-[0.16em] text-[#6e6e73] uppercase">{children}</p>
  );
}
