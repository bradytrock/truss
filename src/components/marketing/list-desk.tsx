"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SuiteCard } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createDefaultEmailDocument, saveEmailDocuments, loadEmailDocuments } from "@/lib/marketing/email-document";
import { LIST_ROLE_META, LIST_ROLES, nameFromEmail, parseListPaste, type ListRole } from "@/lib/marketing/lists";
import {
  addMarketingListMembers,
  copyMarketingListMembers,
  deleteMarketingList,
  removeMarketingListMember,
  updateMarketingList,
  type MarketingList,
} from "@/lib/marketing/lists-store";
import { looksLikeEmail } from "@/lib/share-text";
import type { Contact } from "@/lib/types";

const LARGE_PASTE = 15;

export function ListDesk({
  list,
  lists,
  contacts,
  companyId,
  staffId,
  onAddContact,
  onUpdateContact,
}: {
  list: MarketingList;
  lists: MarketingList[];
  contacts: Contact[];
  companyId: string;
  staffId: string;
  onAddContact: (input: Omit<Contact, "id">) => Promise<Contact>;
  onUpdateContact: (id: string, patch: Partial<Omit<Contact, "id">>) => Promise<boolean>;
}) {
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyTarget, setCopyTarget] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const parsed = parseListPaste(draft);
  const needsConfirm = parsed.entries.length > LARGE_PASTE;
  const members = list.contactIds
    .map((id) => contacts.find((contact) => contact.id === id))
    .filter((contact): contact is Contact => Boolean(contact));
  const missing = list.contactIds.length - members.length;
  const emailable = members.filter((contact) => looksLikeEmail(contact.email)).length;
  const others = lists.filter((item) => item.id !== list.id);

  useEffect(() => {
    box.current?.focus();
  }, [list.id]);

  async function addPeople() {
    if (!parsed.entries.length) {
      toast.error(parsed.invalid.length ? "Those lines need an email address." : "Add at least one email.");
      return;
    }
    if (needsConfirm && !confirmed) {
      toast.error("Confirm these people asked to hear from you.");
      return;
    }
    setBusy(true);
    const role = LIST_ROLE_META[list.role];
    const byEmail = new Map(contacts.map((contact) => [contact.email.trim().toLowerCase(), contact]));
    const ids: string[] = [];
    let created = 0;
    let joined = 0;
    let already = 0;
    try {
      for (const entry of parsed.entries) {
        const key = entry.email.trim().toLowerCase();
        const found = byEmail.get(key);
        if (found) {
          if (list.contactIds.includes(found.id) || ids.includes(found.id)) {
            already += 1;
            continue;
          }
          ids.push(found.id);
          joined += 1;
          continue;
        }
        const contact = await onAddContact({
          clientId: null,
          name: entry.name || nameFromEmail(entry.email),
          title: role.title,
          email: entry.email,
          phone: entry.phone,
          ownerStaffId: staffId,
          isReferralPartner: role.partner,
          listingWatchUrl: "",
          listingWatchEnabled: false,
        });
        byEmail.set(key, contact);
        ids.push(contact.id);
        created += 1;
      }
      if (ids.length) await addMarketingListMembers(companyId, list.id, ids);
      setDraft("");
      setConfirmed(false);
      const parts = [
        created ? `${created} new contact${created === 1 ? "" : "s"}` : "",
        joined ? `${joined} already in the CRM` : "",
        already ? `${already} already on this list` : "",
      ].filter(Boolean);
      toast.success(parts.join(" · ") || "Nothing new to add");
      if (parsed.invalid.length) toast.message(`${parsed.invalid.length} line${parsed.invalid.length === 1 ? "" : "s"} had no email and were skipped.`);
    } catch {
      // addContact already tells the user why the person was not saved.
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  }

  function openCampaign() {
    const docs = loadEmailDocuments(companyId);
    const next = createDefaultEmailDocument({ listId: list.id, name: list.name });
    saveEmailDocuments(companyId, [next, ...docs]);
    router.push(`/marketing/campaigns/design?doc=${next.id}&step=audience`);
  }

  return (
    <div className="space-y-4">
      <SuiteCard className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            key={list.id}
            className="max-w-sm font-heading text-lg"
            defaultValue={list.name}
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (name && name !== list.name) void updateMarketingList(companyId, list.id, { name });
            }}
          />
          <select
            className="h-8 rounded-md border bg-white px-2 text-sm"
            value={list.role}
            onChange={(event) => void updateMarketingList(companyId, list.id, { role: event.target.value as ListRole })}
          >
            {LIST_ROLES.map((role) => (
              <option key={role} value={role}>
                {LIST_ROLE_META[role].label}
              </option>
            ))}
          </select>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => router.push(`/marketing/quick-send?list=${list.id}`)}>
              Quick send
            </Button>
            <Button type="button" size="sm" onClick={openCampaign}>
              Campaign
            </Button>
          </div>
        </div>
        <p className="text-xs text-[#6f6a64]">
          Role applies to people you add next. Real estate agents and insurance contacts are marked as referral partners.
        </p>
        <Textarea
          ref={box}
          rows={4}
          placeholder={"sarah@kw.com\nSarah Chen, sarah@kw.com, 214-555-0142"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !draft.includes("\n")) {
              event.preventDefault();
              void addPeople();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={busy} onClick={() => void addPeople()}>
            {busy ? "Adding…" : "Add to this list"}
          </Button>
          <p className="text-xs text-[#8a8680]">
            {list.contactIds.length} on this list · {emailable} can be emailed
            {members.length - emailable > 0 ? ` · ${members.length - emailable} missing an email` : ""}
            {missing > 0 ? ` · ${missing} not in the contact book` : ""}
          </p>
        </div>
        {needsConfirm ? (
          <label className="flex items-start gap-2 text-sm text-[#6a5430]">
            <input className="mt-1" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            These {parsed.entries.length} people asked to hear from us or have done business with us.
          </label>
        ) : null}
      </SuiteCard>
      <SuiteCard className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((contact) => (
              <tr key={contact.id} className="border-t border-[#f0eeeb]">
                <td className="px-4 py-2">
                  <Input
                    defaultValue={contact.name}
                    onBlur={(event) => {
                      const name = event.target.value.trim();
                      if (name && name !== contact.name) void onUpdateContact(contact.id, { name });
                    }}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    defaultValue={contact.email}
                    onBlur={(event) => {
                      const email = event.target.value.trim();
                      if (email !== contact.email) void onUpdateContact(contact.id, { email });
                    }}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    defaultValue={contact.phone}
                    onBlur={(event) => {
                      if (event.target.value !== contact.phone) void onUpdateContact(contact.id, { phone: event.target.value });
                    }}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" className="text-xs text-[#8a8680] hover:text-[#1c1b1a]" onClick={() => void removeMarketingListMember(companyId, list.id, contact.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-sm text-[#6f6a64]">
                  Nobody on this list yet. Type an email and press Enter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SuiteCard>
      <div className="flex flex-wrap items-center gap-2">
        {others.length ? (
          <>
            <select className="h-8 rounded-md border bg-white px-2 text-sm" value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>
              <option value="">Add these people to…</option>
              {others.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!copyTarget}
              onClick={() => {
                void copyMarketingListMembers(companyId, list.id, copyTarget).then((added) => {
                  const target = lists.find((item) => item.id === copyTarget);
                  toast.success(added.length ? `Added ${added.length} to ${target?.name || "the list"}` : "They were already on that list");
                });
              }}
            >
              Copy
            </Button>
          </>
        ) : null}
        {confirmDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void deleteMarketingList(companyId, list.id);
              toast.success("List deleted. The contacts stay in the CRM.");
            }}
          >
            Delete this list
          </Button>
        ) : (
          <button type="button" className="text-xs text-[#8a8680]" onClick={() => setConfirmDelete(true)}>
            Delete list
          </button>
        )}
      </div>
    </div>
  );
}
