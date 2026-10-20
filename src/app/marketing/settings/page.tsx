"use client";

import { useEffect, useState } from "react";
import { SuiteCard, SuitePage, SuiteTitle } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrm } from "@/lib/crm-store";
import { RESEND_FROM_ADDRESS, RESEND_FROM_DOMAIN } from "@/lib/resend-from";
import { saveGuardrails, useGuardrails, type MarketingGuardrails } from "@/lib/marketing/suite-prefs";

const TABS = ["Sending domain", "Compliance", "Brand & footer", "Team permissions"] as const;

export default function MarketingSettingsPage() {
  const crm = useCrm();
  const companyId = crm.user.companyId || "local";
  const [tab, setTab] = useState<(typeof TABS)[number]>("Sending domain");
  const guard = useGuardrails(companyId);
  const [from, setFrom] = useState(RESEND_FROM_ADDRESS);

  useEffect(() => {
    void fetch("/api/share/email")
      .then((response) => response.json())
      .then((payload: { from?: string; address?: string }) => {
        if (payload.address) setFrom(payload.address);
        else if (payload.from) setFrom(payload.from);
      })
      .catch(() => undefined);
  }, [companyId]);

  function patch(partial: Partial<MarketingGuardrails>) {
    saveGuardrails(companyId, { ...guard, ...partial });
  }

  return (
    <SuitePage>
      <SuiteTitle title="Marketing settings" description="Set these up once so emails land in the inbox, not spam." />
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full px-3 py-1 text-sm ${tab === item ? "bg-[#1c1b1a] text-white" : "bg-white"}`}>
            {item}
          </button>
        ))}
      </div>
      {tab === "Sending domain" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <SuiteCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">Sending domain</h2>
                <p className="text-sm text-[#6f6a64]">{RESEND_FROM_DOMAIN}</p>
              </div>
              <Button type="button" size="sm" onClick={() => window.location.reload()}>Check again</Button>
            </div>
            <p className="mt-2 text-sm text-[#6f6a64]">
              Marketing mail goes out as {from}. DNS for that domain is managed with the email provider, not inside this screen.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
                  <tr><th className="py-2">Type</th><th>Host</th><th>Purpose</th><th>Status</th></tr>
                </thead>
                <tbody>
                  <tr className="border-t"><td className="py-2">From</td><td>{from}</td><td>Mailbox</td><td className="text-emerald-700">In use</td></tr>
                  <tr className="border-t"><td className="py-2">SPF</td><td>{RESEND_FROM_DOMAIN}</td><td>Authorizes the sender</td><td>Add at your DNS host</td></tr>
                  <tr className="border-t"><td className="py-2">DKIM</td><td>{RESEND_FROM_DOMAIN}</td><td>Signs each message</td><td>Add at your DNS host</td></tr>
                  <tr className="border-t"><td className="py-2">DMARC</td><td>_dmarc.{RESEND_FROM_DOMAIN}</td><td>Tells receivers what to do</td><td>Add at your DNS host</td></tr>
                </tbody>
              </table>
            </div>
            <h3 className="mt-6 font-medium">From addresses</h3>
            <ul className="mt-2 divide-y">
              {crm.staff.slice(0, 6).map((member) => (
                <li key={member.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium">{member.name}</span>
                    <span className="block text-xs text-[#8a8680]">{member.email || "No email on the seat"} · replies go here</span>
                  </span>
                  <span className="text-xs text-emerald-700">{member.email ? "Reply-to" : "Add email"}</span>
                </li>
              ))}
            </ul>
          </SuiteCard>
          <SuiteCard className="p-4 text-sm">
            <h3 className="font-medium">What receivers check</h3>
            <ul className="mt-2 space-y-2 text-[#3f3c38]">
              <li>SPF record on {RESEND_FROM_DOMAIN}</li>
              <li>DKIM signing</li>
              <li>One-click unsubscribe on every marketing email</li>
            </ul>
          </SuiteCard>
        </div>
      ) : null}
      {tab === "Compliance" ? (
        <SuiteCard className="space-y-3 p-4 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" checked readOnly /> One-click unsubscribe on every marketing email. Required.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked readOnly /> Block purchased or rented list imports. Required.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={guard.pauseOnBounce} onChange={(event) => patch({ pauseOnBounce: event.target.checked })} /> Pause a campaign automatically if bounces pass 5%.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={guard.frequencyCap} onChange={(event) => patch({ frequencyCap: event.target.checked })} /> Frequency cap: no more than 2 marketing emails per contact per week. Quick send honors this on this browser.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={guard.quietHours} onChange={(event) => patch({ quietHours: event.target.checked })} /> Quiet hours: hold sends between 8 PM and 8 AM Central.</label>
          <label className="block">
            Mailing address in every footer
            <Input className="mt-1" value={guard.mailingAddress} onChange={(event) => patch({ mailingAddress: event.target.value })} placeholder={crm.company.street || "Street, city, state"} />
          </label>
        </SuiteCard>
      ) : null}
      {tab === "Brand & footer" ? (
        <SuiteCard className="space-y-3 p-4 text-sm">
          <p>Templates use {crm.company.name}, {crm.company.phone || "the company phone"}, and the logo on file.</p>
          <div className="flex gap-2">
            {["#d71c27", "#1c1b1a", "#1f6f5b", "#f4f1ea"].map((color) => (
              <span key={color} className="size-8 rounded-md border" style={{ background: color }} />
            ))}
          </div>
          <p className="text-[#6f6a64]">Headlines are serif. Body copy is the same sans as the rest of the CRM.</p>
        </SuiteCard>
      ) : null}
      {tab === "Team permissions" ? (
        <SuiteCard className="p-4 text-sm">
          <p>Anyone who can open Marketing can design and send. Company admins change the sending domain and guardrails.</p>
          <ul className="mt-3 divide-y">
            {crm.staff.slice(0, 8).map((member) => (
              <li key={member.id} className="flex justify-between py-2">
                <span>{member.name}</span>
                <span className="text-[#6f6a64]">{member.title || member.role}</span>
              </li>
            ))}
          </ul>
        </SuiteCard>
      ) : null}
    </SuitePage>
  );
}
