"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { paymentOptions, type CompanyPaymentFields } from "@/lib/payments";
import {
  cardPayRemaining,
  isPendingPayment,
  isPostedPayment,
  paymentMethodLabel,
  pendingCardOnInvoice,
} from "@/lib/payment-posting";
import { invoiceBalance, paidOnInvoice } from "@/lib/money";
import type { Invoice, InvoiceLine, Payment } from "@/lib/types";

export function InvoicePayPanel({
  invoice,
  lines,
  payments,
  company,
  token,
  stripeEnabled,
  payable = true,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  company: CompanyPaymentFields;
  token: string;
  stripeEnabled?: boolean;
  payable?: boolean;
}) {
  const cardReady = useStripeEnabled(stripeEnabled, token);
  const paid = paidOnInvoice(invoice.id, payments);
  const balance = invoiceBalance(invoice.id, lines, payments);
  const pendingCard = pendingCardOnInvoice(invoice.id, payments);
  const cardLeft = cardPayRemaining(balance, pendingCard);
  const history = [...payments]
    .filter((payment) => payment.invoiceId === invoice.id)
    .filter((payment) => isPostedPayment(payment) || isPendingPayment(payment))
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const options = paymentOptions(company);
  const note = company.paymentNote?.trim() ?? "";
  const showPay = payable && invoice.status !== "void" && invoice.status !== "draft" && balance > 0;
  const showCard = showPay && cardReady && cardLeft > 0;

  return (
    <section className="space-y-4 rounded-md border bg-card p-5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Payments</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Previous payments and every way to pay the remaining balance.
        </p>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments on this invoice yet.</p>
      ) : (
        <ul className="divide-y border-y text-sm">
          {history.map((payment) => (
            <li key={payment.id} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="font-medium">
                  {paymentMethodLabel(payment.method)}
                  {isPendingPayment(payment) ? " · pending" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(payment.paidAt)}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </p>
              </div>
              <p className="tabular-nums">{formatMoney(payment.amount)}</p>
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="tabular-nums">{formatMoney(paid)}</dd>
        </div>
        {pendingCard > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Card pending</dt>
            <dd className="tabular-nums">{formatMoney(pendingCard)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t pt-2 font-medium">
          <dt>Balance due</dt>
          <dd className="tabular-nums">{formatMoney(balance)}</dd>
        </div>
      </dl>
      {showPay ? (
        <div className="space-y-3">
          {showCard ? (
            <StripeCheckoutButton
              token={token}
              kind="invoice"
              label={`Pay ${formatMoney(cardLeft)} by card`}
            />
          ) : null}
          <PayOptionsList options={options} note={note} />
          {showCard ? (
            <p className="text-xs text-muted-foreground">
              Card is optional. A card charge stays pending until accounting matches it in Stripe.
            </p>
          ) : null}
        </div>
      ) : balance <= 0 ? (
        <p className="text-sm">This invoice is paid in full.</p>
      ) : null}
    </section>
  );
}

export function EstimateDepositPayPanel({
  token,
  deposit,
  collected,
  company,
  stripeEnabled,
}: {
  token: string;
  deposit: number;
  collected: number;
  company: CompanyPaymentFields;
  stripeEnabled?: boolean;
}) {
  const cardReady = useStripeEnabled(stripeEnabled, token);
  const remaining = Math.max(0, deposit - collected);
  const options = paymentOptions(company);
  const note = company.paymentNote?.trim() ?? "";
  if (deposit <= 0) return null;

  return (
    <section className="space-y-3 rounded-md border bg-card p-5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Deposit</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A deposit of {formatMoney(deposit)} is due. Paying by card is optional — we can collect it
          another way.
        </p>
      </div>
      {collected > 0 ? (
        <p className="text-sm">
          {formatMoney(collected)} received
          {remaining > 0 ? ` · ${formatMoney(remaining)} remaining` : "."}
        </p>
      ) : null}
      {remaining > 0 && cardReady ? (
        <StripeCheckoutButton
          token={token}
          kind="deposit"
          label={`Pay ${formatMoney(remaining)} deposit by card`}
        />
      ) : remaining <= 0 ? (
        <p className="text-sm">Deposit received. Thank you.</p>
      ) : null}
      {remaining > 0 ? <PayOptionsList options={options} note={note} /> : null}
    </section>
  );
}

function useStripeEnabled(explicit?: boolean, token?: string) {
  const [enabled, setEnabled] = useState(explicit ?? false);
  useEffect(() => {
    if (explicit !== undefined) {
      setEnabled(explicit);
      return;
    }
    let cancelled = false;
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    void fetch(`/api/stripe/status${query}`)
      .then((response) => response.json())
      .then((body: { enabled?: boolean }) => {
        if (!cancelled) setEnabled(Boolean(body.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [explicit, token]);
  return enabled;
}

function StripeCheckoutButton({
  token,
  kind,
  label,
}: {
  token: string;
  kind: "invoice" | "deposit";
  label: string;
}) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("paid") === "1") {
      toast.success("Card payment received. It stays pending until accounting matches Stripe.");
    }
  }, []);

  async function startPay() {
    setPending(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        toast.error(data.error || "Could not start the card payment.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Could not start the card payment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" disabled={pending} onClick={() => void startPay()}>
      {pending ? "Starting…" : label}
    </Button>
  );
}

function PayOptionsList({
  options,
  note,
}: {
  options: ReturnType<typeof paymentOptions>;
  note: string;
}) {
  if (options.length === 0 && !note) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Other ways to pay
      </p>
      {options.length > 0 ? (
        <ul className="grid gap-2">
          {options.map((option) => (
            <li key={option.rail}>
              {option.href ? (
                <a
                  href={option.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{option.label}</span>
                  <span className="truncate text-muted-foreground">{option.handle}</span>
                </a>
              ) : (
                <p className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{option.label}</span>
                  <span className="truncate text-muted-foreground">{option.handle}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="text-xs leading-relaxed text-muted-foreground">{note}</p> : null}
    </div>
  );
}
