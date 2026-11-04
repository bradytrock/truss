"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ListDesk } from "@/components/marketing/list-desk";
import { SuiteCard, SuitePage, SuiteTitle } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrm } from "@/lib/crm-store";
import { LIST_ROLES, LIST_ROLE_META, type ListRole } from "@/lib/marketing/lists";
import { addMarketingListMembers, createMarketingList, useMarketingLists } from "@/lib/marketing/lists-store";
import { looksLikeEmail } from "@/lib/share-text";
import { saveSegments, useSegments, type SavedSegment, type SegmentRule } from "@/lib/marketing/suite-prefs";
import type { Contact, Job } from "@/lib/types";

function contactCity(contact: Contact, jobs: Job[]) {
  const job = jobs.find((item) => item.primaryContactId === contact.id || item.relatedContactIds.includes(contact.id));
  return job?.city || "";
}

function contactType(contact: Contact, jobs: Job[]) {
  if (contact.isReferralPartner || /realtor|agent|insurance|property/i.test(contact.title)) return "Partner";
  const related = jobs.filter((job) => !job.deletedAt && (job.primaryContactId === contact.id || job.relatedContactIds.includes(contact.id)));
  if (related.some((job) => job.status !== "complete")) return "Current job";
  if (related.some((job) => job.status === "complete")) return "Past client";
  return "Contact";
}

function matches(contact: Contact, jobs: Job[], rule: SegmentRule) {
  const value =
    rule.field === "type"
      ? contactType(contact, jobs)
      : rule.field === "city"
        ? contactCity(contact, jobs)
        : rule.field === "email"
          ? contact.email
          : contact.title;
  const expected = rule.value.trim().toLowerCase();
  const actual = value.toLowerCase();
  if (rule.op === "contains") return actual.includes(expected);
  if (rule.op === "is_not") return actual !== expected;
  return actual === expected;
}

function ContactsPage() {
  const crm = useCrm();
  const params = useSearchParams();
  const companyId = crm.user.companyId || "local";
  const lists = useMarketingLists(companyId);
  const segments = useSegments(companyId);
  const [pick, setPick] = useState(params.get("list") ? `list:${params.get("list")}` : params.get("capture") === "1" ? "capture" : "all");
  const [activeId, setActiveId] = useState("all");
  const [listName, setListName] = useState("");
  const [listRole, setListRole] = useState<ListRole>("realtor");
  const active = segments.find((segment) => segment.id === activeId) ?? null;
  const [name, setName] = useState("");
  const [rules, setRules] = useState<SegmentRule[] | null>(null);
  const draftName = rules && active ? name : active?.name || "New segment";
  const draftRules = rules && active ? rules : active?.rules || [];
  const requestedList = pick.startsWith("list:") ? lists.find((list) => list.id === pick.slice(5)) ?? null : null;
  const captureList = pick === "capture" ? lists[0] ?? null : null;
  const activeList = requestedList ?? captureList;
  const showNew = pick === "new" || (pick === "capture" && !activeList);

  const jobs = crm.jobs;
  const rows =
    activeId === "all"
      ? crm.contacts
      : crm.contacts.filter((contact) => draftRules.every((rule) => !rule.value.trim() || matches(contact, jobs, rule)));

  function persist(nextRules: SegmentRule[], nextName = draftName) {
    setRules(nextRules);
    setName(nextName);
    if (!active) return;
    saveSegments(
      companyId,
      segments.map((segment) => (segment.id === active.id ? { ...segment, name: nextName, rules: nextRules } : segment)),
    );
  }

  async function createList() {
    const list = await createMarketingList(companyId, {
      name: listName.trim() || "New list",
      role: listRole,
      staffId: crm.user.staffId,
    });
    setListName("");
    setPick(`list:${list.id}`);
    toast.success(`${list.name} is ready. Add emails below.`);
  }

  return (
    <SuitePage className="max-w-[1240px]">
      <SuiteTitle
        title="Contacts & lists"
        description="Lists are people you name. Segments keep watching the CRM as jobs and contacts change."
        action={
          <Button type="button" onClick={() => setPick("new")}>
            New list
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <SuiteCard className="p-3 text-sm">
          <p className="px-2 pb-1 text-[10px] tracking-[0.14em] text-[#8a8680] uppercase">Your lists</p>
          {lists.length === 0 ? <p className="px-2 py-1.5 text-xs text-[#8a8680]">None yet. Start one for an event.</p> : null}
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => setPick(`list:${list.id}`)}
              className={`flex w-full justify-between rounded-md px-2 py-1.5 text-left ${activeList?.id === list.id ? "bg-[#1c1b1a] text-white" : ""}`}
            >
              <span className="truncate">{list.name}</span>
              <span>{list.contactIds.length}</span>
            </button>
          ))}
          <p className="mt-3 px-2 pb-1 text-[10px] tracking-[0.14em] text-[#8a8680] uppercase">Lists from the CRM</p>
          <button
            type="button"
            onClick={() => {
              setPick("all");
              setActiveId("all");
            }}
            className={`flex w-full justify-between rounded-md px-2 py-1.5 ${pick === "all" ? "bg-[#1c1b1a] text-white" : ""}`}
          >
            All contacts <span>{crm.contacts.length}</span>
          </button>
          <p className="flex justify-between px-2 py-1.5 text-[#6f6a64]">With email <span>{crm.contacts.filter((contact) => looksLikeEmail(contact.email)).length}</span></p>
          <p className="flex justify-between px-2 py-1.5 text-[#6f6a64]">Partners <span>{crm.contacts.filter((contact) => contact.isReferralPartner).length}</span></p>
          <p className="mt-3 px-2 pb-1 text-[10px] tracking-[0.14em] text-[#8a8680] uppercase">Saved segments</p>
          {segments.length === 0 ? <p className="px-2 text-xs text-[#8a8680]">None yet.</p> : null}
          {segments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              onClick={() => {
                setPick("segment");
                setActiveId(segment.id);
                setName("");
                setRules(null);
              }}
              className={`flex w-full justify-between rounded-md px-2 py-1.5 text-left ${pick === "segment" && activeId === segment.id ? "bg-[#1c1b1a] text-white" : ""}`}
            >
              {segment.name}
            </button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 w-full"
            onClick={() => {
              const segment: SavedSegment = { id: crypto.randomUUID(), name: "New segment", rules: [{ id: crypto.randomUUID(), field: "type", op: "is", value: "Past client" }] };
              saveSegments(companyId, [segment, ...segments]);
              setPick("segment");
              setActiveId(segment.id);
              setName(segment.name);
              setRules(segment.rules);
            }}
          >
            New segment
          </Button>
          <p className="mt-4 px-2 text-xs text-[#8a8680]">Suppressed contacts are skipped by every email. Unsubscribes live on the company.</p>
        </SuiteCard>
        {showNew ? (
          <SuiteCard className="space-y-3 p-4">
            <h2 className="font-heading text-2xl font-medium">New list</h2>
            <p className="text-sm text-[#6f6a64]">Name it for the room, like KW lunch · March 12, or for the people you mail all year.</p>
            <Input placeholder="Real Estate Agents" value={listName} onChange={(event) => setListName(event.target.value)} />
            <select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={listRole} onChange={(event) => setListRole(event.target.value as ListRole)}>
              {LIST_ROLES.map((role) => (
                <option key={role} value={role}>
                  {LIST_ROLE_META[role].label}
                </option>
              ))}
            </select>
            <Button type="button" onClick={() => void createList()}>
              Create list
            </Button>
          </SuiteCard>
        ) : null}
        {activeList && !showNew ? (
          <ListDesk
            list={activeList}
            lists={lists}
            contacts={crm.contacts}
            companyId={companyId}
            staffId={crm.user.staffId || ""}
            onAddContact={crm.addContact}
            onUpdateContact={crm.updateContact}
          />
        ) : null}
        {!activeList && !showNew ? (
          <div className="space-y-4">
            <SuiteCard className="p-4">
              {pick !== "segment" ? (
                <h2 className="font-heading text-2xl font-medium">All contacts</h2>
              ) : (
                <>
                  <Input value={draftName} onChange={(event) => { setName(event.target.value); persist(draftRules, event.target.value); }} />
                  <div className="mt-3 space-y-2">
                    {draftRules.map((rule) => (
                      <div key={rule.id} className="flex flex-wrap gap-2">
                        <select className="h-8 rounded-md border bg-white px-2 text-sm" value={rule.field} onChange={(event) => persist(draftRules.map((item) => item.id === rule.id ? { ...item, field: event.target.value as SegmentRule["field"] } : item))}>
                          <option value="type">Contact type</option>
                          <option value="city">City</option>
                          <option value="title">Title</option>
                          <option value="email">Email</option>
                        </select>
                        <select className="h-8 rounded-md border bg-white px-2 text-sm" value={rule.op} onChange={(event) => persist(draftRules.map((item) => item.id === rule.id ? { ...item, op: event.target.value as SegmentRule["op"] } : item))}>
                          <option value="is">is</option>
                          <option value="is_not">is not</option>
                          <option value="contains">contains</option>
                        </select>
                        <Input className="w-48" value={rule.value} onChange={(event) => persist(draftRules.map((item) => item.id === rule.id ? { ...item, value: event.target.value } : item))} />
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => persist([...draftRules, { id: crypto.randomUUID(), field: "city", op: "is", value: "" }])}>
                      Add rule
                    </Button>
                  </div>
                </>
              )}
              <p className="mt-3 text-sm text-[#6f6a64]">{rows.length} contacts · {rows.filter((contact) => looksLikeEmail(contact.email)).length} can be emailed</p>
            </SuiteCard>
            <SuiteCard className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
                  <tr>
                    <th className="px-4 py-2">Contact</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">City</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">List</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 12).map((contact) => (
                    <tr key={contact.id} className="border-t border-[#f0eeeb]">
                      <td className="px-4 py-2 font-medium">{contact.name}</td>
                      <td className="px-4 py-2">{contactType(contact, jobs)}</td>
                      <td className="px-4 py-2">{contactCity(contact, jobs) || "—"}</td>
                      <td className="px-4 py-2 text-[#6f6a64]">{looksLikeEmail(contact.email) ? "Can email" : "No email"}</td>
                      <td className="px-4 py-2">
                        <select
                          className="h-8 max-w-[140px] rounded-md border bg-white px-2 text-xs"
                          value=""
                          onChange={(event) => {
                            const listId = event.target.value;
                            if (!listId) return;
                            void addMarketingListMembers(companyId, listId, [contact.id]).then(() => {
                              const target = lists.find((list) => list.id === listId);
                              toast.success(`${contact.name} is on ${target?.name || "the list"}`);
                            });
                          }}
                        >
                          <option value="">{lists.length ? "Add to list" : "No lists yet"}</option>
                          {lists.map((list) => (
                            <option key={list.id} value={list.id}>
                              {list.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 12 ? <p className="px-4 py-2 text-xs text-[#8a8680]">Showing 12 of {rows.length}</p> : null}
            </SuiteCard>
            <p className="rounded-lg bg-[#f8f1e4] px-3 py-2 text-sm text-[#6a5430]">
              Imports: only add people who&apos;ve done business with you or asked to hear from you. Purchased or rented lists are blocked; they hurt delivery for every email.
            </p>
          </div>
        ) : null}
      </div>
    </SuitePage>
  );
}

export default function MarketingContactsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#6f6a64]">Loading contacts…</div>}>
      <ContactsPage />
    </Suspense>
  );
}
