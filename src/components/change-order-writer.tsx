"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CollectSignatureDialog } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CHANGE_ORDER_STATUS_LABELS,
  changeOrderContractFigures,
  changeOrderEditable,
  changeOrderSignable,
  changeOrderTotals,
  linesForChangeOrder,
  type ChangeOrder,
} from "@/lib/change-orders";
import { catalogItemsMatchingQuery } from "@/lib/catalog-pick";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull } from "@/lib/format";
import { jobRecordHref } from "@/lib/job-record";
import { shareUrl } from "@/lib/share";

export function ChangeOrderWriter({ order }: { order: ChangeOrder }) {
  const crm = useCrm();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("EA");
  const [price, setPrice] = useState("");
  const lines = linesForChangeOrder(crm.changeOrderLines ?? [], order.id);
  const totals = changeOrderTotals(order, lines);
  const figures = changeOrderContractFigures(order, crm.changeOrders ?? [], crm.changeOrderLines ?? []);
  const editable = changeOrderEditable(order.status);
  const job = crm.getJob(order.jobId);
  const estimate = crm.estimates.find((item) => item.id === order.estimateId);
  const contact = estimate?.contactId ? crm.getContact(estimate.contactId) : undefined;
  const matches = useMemo(
    () => (editable ? catalogItemsMatchingQuery(crm.catalog, query, 6) : []),
    [crm.catalog, editable, query],
  );

  async function addCustom() {
    const unitCost = Number(price);
    if (!title.trim() || !Number.isFinite(unitCost)) {
      toast.error("Name the line and enter a price. Use a minus for a credit.");
      return;
    }
    setPending(true);
    try {
      await crm.addChangeOrderLine(order.id, {
        title: title.trim(),
        quantity: Number(quantity) || 1,
        unit: unit.trim() || "EA",
        unitCost,
      });
      setTitle("");
      setPrice("");
      setQuantity("1");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    setPending(true);
    try {
      const url = await crm.sendChangeOrder(order.id);
      if (!url) return;
      await navigator.clipboard.writeText(url);
      toast.success(order.status === "draft" ? "Link copied. The change order is sent." : "Link copied.");
    } catch {
      toast.error("Could not copy the link.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {job ? (
              <Link href={jobRecordHref(job.id)} className="hover:underline">
                {job.name}
              </Link>
            ) : (
              "Job"
            )}
            {estimate ? ` · amends ${estimate.number}` : ""}
          </p>
          <h1 className="font-heading text-3xl font-medium">{order.number}</h1>
          <p className="text-sm text-muted-foreground">{CHANGE_ORDER_STATUS_LABELS[order.status]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable || order.status === "sent" || order.status === "viewed" ? (
            <Button type="button" variant="outline" disabled={pending || lines.length === 0} onClick={() => void copyLink()}>
              {order.status === "draft" ? "Send link" : "Copy link"}
            </Button>
          ) : null}
          {changeOrderSignable(order.status) ? (
            <Button type="button" disabled={pending || lines.length === 0} onClick={() => setSignOpen(true)}>
              Collect signature
            </Button>
          ) : null}
          {order.status === "accepted" && !order.invoiceId ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void crm
                  .convertChangeOrderToInvoice(order.id)
                  .then((invoice) => {
                    if (invoice) router.push(`/invoices/${invoice.id}`);
                  })
                  .finally(() => setPending(false));
              }}
            >
              Bill this change
            </Button>
          ) : null}
          {order.invoiceId ? (
            <Button type="button" variant="outline" nativeButton={false} render={<Link href={`/invoices/${order.invoiceId}`} />}>
              Open invoice
            </Button>
          ) : null}
          {order.status !== "void" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                const dropping = order.status === "accepted" || order.status === "draft";
                if (order.status === "accepted" && !window.confirm(`Void ${order.number}? The contract goes back without this change.`)) {
                  return;
                }
                setPending(true);
                const run = dropping ? crm.voidChangeOrder(order.id) : crm.reopenChangeOrder(order.id);
                void run.finally(() => setPending(false));
              }}
            >
              {order.status === "accepted" || order.status === "draft" ? "Void" : "Reopen"}
            </Button>
          ) : null}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Reason</span>
        <Textarea
          defaultValue={order.reason}
          disabled={!editable}
          rows={2}
          placeholder="What changed, and why."
          onBlur={(event) => {
            const reason = event.target.value;
            if (reason !== order.reason) void crm.updateChangeOrder(order.id, { reason });
          }}
        />
      </label>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[1fr_5rem_4rem_7rem_auto] gap-2 border-b px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span>Line</span>
          <span>Qty</span>
          <span>Unit</span>
          <span className="text-right">Price</span>
          <span />
        </div>
        {lines.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No lines yet. A minus price is a credit.</p>
        ) : (
          <ul>
            {lines.map((line) => (
              <li key={line.id} className="grid grid-cols-[1fr_5rem_4rem_7rem_auto] items-center gap-2 border-b px-3 py-2 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{line.title}</span>
                  {line.description ? <span className="block truncate text-xs text-muted-foreground">{line.description}</span> : null}
                </span>
                {editable ? (
                  <Input
                    defaultValue={String(line.quantity)}
                    inputMode="decimal"
                    onBlur={(event) => {
                      const quantity = Number(event.target.value);
                      if (Number.isFinite(quantity) && quantity !== line.quantity) {
                        void crm.updateChangeOrderLine(line.id, { quantity });
                      }
                    }}
                  />
                ) : (
                  <span className="text-sm tabular-nums">{line.quantity}</span>
                )}
                <span className="text-sm text-muted-foreground">{line.unit}</span>
                <span className="text-right text-sm tabular-nums">{formatCurrencyFull(line.quantity * line.unitCost)}</span>
                {editable ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void crm.removeChangeOrderLine(line.id)}>
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <div className="space-y-3 border-t px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_5rem_4rem_7rem_auto]">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Line" />
              <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" />
              <Input value={unit} onChange={(event) => setUnit(event.target.value)} />
              <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="0.00" />
              <Button type="button" disabled={pending} onClick={() => void addCustom()}>
                Add
              </Button>
            </div>
            <div>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the price book"
              />
              {query.trim() && matches.length > 0 ? (
                <ul className="mt-2 divide-y rounded-lg border">
                  {matches.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          void crm.addChangeOrderLineFromCatalog(order.id, item.id);
                          setQuery("");
                        }}
                      >
                        <span>{item.name}</span>
                        <span className="tabular-nums text-muted-foreground">{item.unit}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <dl className="grid gap-2 rounded-xl border bg-card px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Contract before</dt>
          <dd className="tabular-nums">{formatCurrencyFull(figures.before)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">This change{totals.tax !== 0 ? ` · tax ${formatCurrencyFull(totals.tax)}` : ""}</dt>
          <dd className="tabular-nums">
            {figures.delta < 0 ? "−" : "+"}
            {formatCurrencyFull(Math.abs(figures.delta))}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contract after</dt>
          <dd className="font-medium tabular-nums">{formatCurrencyFull(figures.after)}</dd>
        </div>
      </dl>

      {order.signatureName ? (
        <p className="text-sm text-muted-foreground">Signed by {order.signatureName}.</p>
      ) : null}
      {order.status === "sent" || order.status === "viewed" ? (
        <p className="text-xs text-muted-foreground">Homeowner link: {shareUrl("c", order.shareToken)}</p>
      ) : null}

      <CollectSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        defaultName={contact?.name || ""}
        estimateNumber={order.number}
        homeownerName={contact?.name}
        propertyAddress={job?.location || ""}
        totalLabel={`${figures.delta < 0 ? "−" : "+"}${formatCurrencyFull(Math.abs(figures.delta))}`}
        pending={pending}
        onSubmit={async ({ name, image }) => {
          setPending(true);
          try {
            const ok = await crm.acceptChangeOrder(order.id, { name, image });
            if (ok) setSignOpen(false);
          } finally {
            setPending(false);
          }
        }}
      />
    </div>
  );
}
