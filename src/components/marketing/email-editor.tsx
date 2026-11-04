"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  Columns2,
  GripVertical,
  Image as ImageIcon,
  Minus,
  Monitor,
  Play,
  Smartphone,
  Space,
  Star,
  Type,
  UserRound,
  X,
  RectangleHorizontal,
  Images,
  Hash,
  Copy,
  Trash2,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import {
  EMAIL_CAMPAIGN_AUDIENCE_LABELS,
  EMAIL_CAMPAIGN_SEND_CAP,
  resolveEmailCampaignAudience,
  splitCampaignRecipients,
  type EmailCampaignAudience,
  type EmailCampaignRecipient,
} from "@/lib/marketing/email-campaigns";
import {
  EMAIL_BLOCK_LABELS,
  EMAIL_BLOCK_TYPES,
  createDefaultEmailDocument,
  createEmailBlock,
  emailBlockId,
  emailDocumentPlainText,
  loadEmailDocuments,
  renderEmailDocumentHtml,
  saveEmailDocuments,
  saveSavedEmailBlocks,
  useEmailDocuments,
  useSavedEmailBlocks,
  type EmailBlock,
  type EmailBlockType,
  type EmailDocument,
} from "@/lib/marketing/email-document";
import { RESEND_FROM_ADDRESS } from "@/lib/resend-from";
import { cn } from "@/lib/utils";

const MERGE_FIELDS = ["{{firstName}}", "{{jobCity}}", "{{repName}}", "{{repPhone}}", "{{inspectionLink}}"];

const PALETTE_ICONS: Record<EmailBlockType, typeof Type> = {
  text: Type,
  image: ImageIcon,
  button: RectangleHorizontal,
  columns: Columns2,
  job_photos: Images,
  before_after: Columns2,
  review: Star,
  rep_card: UserRound,
  divider: Minus,
  video: Play,
  social: Hash,
  spacer: Space,
};

type Step = "design" | "audience" | "review";

export function EmailStudio({ documentId }: { documentId?: string }) {
  const crm = useCrm();
  const router = useRouter();
  const companyId = crm.user.companyId || "local";
  const docs = useEmailDocuments(companyId);
  const saved = useSavedEmailBlocks(companyId);
  const stored = documentId ? docs.find((item) => item.id === documentId) ?? null : null;
  const [draft, setDraft] = useState<EmailDocument | null>(null);
  const doc = draft && draft.id === documentId ? draft : stored;
  const [step, setStep] = useState<Step>("design");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [panel, setPanel] = useState<"blocks" | "styles" | "saved">("blocks");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!draft) return;
    const current = loadEmailDocuments(companyId);
    const next = current.some((item) => item.id === draft.id)
      ? current.map((item) => (item.id === draft.id ? draft : item))
      : [draft, ...current];
    saveEmailDocuments(companyId, next);
  }, [companyId, draft]);

  const activeBlockId = selectedId ?? doc?.blocks[0]?.id ?? null;

  useEffect(() => {
    if (!selectedId || step !== "design") return;
    document.querySelector(`[data-block-id="${selectedId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedId, step]);
  const selected = doc?.blocks.find((block) => block.id === activeBlockId) ?? null;
  const audience = useMemo(() => {
    if (!doc) return { sending: [] as EmailCampaignRecipient[], removed: [] as EmailCampaignRecipient[] };
    const resolved = resolveEmailCampaignAudience(doc.audienceKind, crm.contacts, crm.jobs, {
      city: doc.city,
      zip: doc.zip,
      includePunch: doc.includePunch,
    });
    return splitCampaignRecipients(resolved, doc.excludedContactIds ?? []);
  }, [crm.contacts, crm.jobs, doc]);
  const recipients = audience.sending;

  function withDoc(update: (current: EmailDocument) => EmailDocument) {
    setDraft((current) => {
      const base = current && current.id === documentId ? current : stored;
      if (!base) return current;
      return update(base);
    });
  }

  function patch(partial: Partial<EmailDocument>) {
    withDoc((current) => ({ ...current, ...partial, updatedAt: new Date().toISOString() }));
  }

  function removeRecipient(contactId: string) {
    withDoc((current) => {
      const excluded = current.excludedContactIds ?? [];
      if (excluded.includes(contactId)) return current;
      return {
        ...current,
        excludedContactIds: [...excluded, contactId],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function restoreRecipient(contactId: string) {
    withDoc((current) => ({
      ...current,
      excludedContactIds: (current.excludedContactIds ?? []).filter((id) => id !== contactId),
      updatedAt: new Date().toISOString(),
    }));
  }

  function patchBlock(id: string, partial: Partial<EmailBlock>) {
    withDoc((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      blocks: current.blocks.map((block) => (block.id === id ? ({ ...block, ...partial } as EmailBlock) : block)),
    }));
  }

  function insertBlock(type: EmailBlockType, index?: number) {
    const block = createEmailBlock(type);
    withDoc((current) => {
      const blocks = [...current.blocks];
      const at = index == null || index < 0 ? blocks.length : index;
      blocks.splice(at, 0, block);
      return { ...current, blocks, updatedAt: new Date().toISOString() };
    });
    setSelectedId(block.id);
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!doc || !overId) return;
    if (activeId.startsWith("palette:")) {
      const type = activeId.slice("palette:".length) as EmailBlockType;
      const index = doc.blocks.findIndex((block) => block.id === overId);
      insertBlock(type, index === -1 ? undefined : index);
      return;
    }
    if (activeId === overId) return;
    const oldIndex = doc.blocks.findIndex((block) => block.id === activeId);
    const newIndex = doc.blocks.findIndex((block) => block.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    patch({ blocks: arrayMove(doc.blocks, oldIndex, newIndex) });
  }

  async function send(test: boolean) {
    if (!doc) return;
    if (!test && doc.audienceKind === "storm" && !doc.city.trim() && !doc.zip.trim()) {
      toast.error("Add a city or ZIP before sending the storm list");
      setStep("audience");
      return;
    }
    setSending(true);
    try {
      const html = renderEmailDocumentHtml({
        doc,
        companyName: crm.company.name,
        phone: crm.effectiveStaff?.phone || crm.company.phone,
        logoUrl: crm.company.logoUrl,
        address: [crm.company.street, crm.company.city, crm.company.state, crm.company.postalCode]
          .filter(Boolean)
          .join(", "),
      });
      const body = emailDocumentPlainText(doc);
      const response = await fetch(test ? "/api/marketing/campaigns/test" : "/api/marketing/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          test
            ? { subject: doc.subject, body, html }
            : {
                name: doc.name,
                audienceKind: doc.audienceKind,
                city: doc.city,
                zip: doc.zip,
                includePunch: doc.includePunch,
                subject: doc.subject,
                body,
                html,
                contactIds: recipients.slice(0, EMAIL_CAMPAIGN_SEND_CAP).map((row) => row.contactId),
              },
        ),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; campaignId?: string; to?: string; sent?: number } | null;
      if (!response.ok) {
        toast.error(payload?.error || "Could not send that email");
        return;
      }
      if (test) {
        toast.success(payload?.to ? `Test sent to ${payload.to}` : "Test sent");
        return;
      }
      const campaignId = payload?.campaignId || null;
      patch({ status: "sent", campaignId });
      toast.success(`Sent to ${payload?.sent ?? recipients.length}`);
      if (campaignId) router.push(`/marketing/campaigns/${campaignId}`);
      else router.push("/marketing/campaigns");
    } finally {
      setSending(false);
    }
  }

  if (!doc) {
    return (
      <div className="grid h-dvh place-items-center">
        <div className="max-w-sm text-center">
          <p className="font-heading text-2xl">Start a campaign</p>
          <p className="mt-2 text-sm text-[#6f6a64]">The editor opens on a hail-check layout you can drag apart and rebuild.</p>
          <Button
            type="button"
            className="mt-4"
            onClick={() => {
              const next = createDefaultEmailDocument();
              saveEmailDocuments(companyId, [next, ...docs]);
              router.push(`/marketing/campaigns/design?doc=${next.id}`);
            }}
          >
            New campaign
          </Button>
        </div>
      </div>
    );
  }

  const spam = spamCheck(doc);

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#e4dfd8] bg-[#f7f5f2] px-3 py-2.5">
        <Link href="/marketing/campaigns" className="inline-flex items-center gap-1 text-sm text-[#3f3c38] hover:text-black">
          <ChevronLeft className="size-4" />
          Campaigns
        </Link>
        <div className="min-w-0">
          <input
            value={doc.name}
            onChange={(event) => patch({ name: event.target.value })}
            className="w-full bg-transparent text-sm font-medium outline-none"
          />
          <p className="text-[11px] text-[#8a8680]">Draft · saved {new Date(doc.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
        </div>
        <ol className="mx-auto flex items-center gap-4 text-sm">
          {(["design", "audience", "review"] as const).map((item, index) => (
            <li key={item}>
              <button
                type="button"
                onClick={() => setStep(item)}
                className={cn("inline-flex items-center gap-1.5", step === item ? "font-medium text-[#1c1b1a]" : "text-[#8a8680]")}
              >
                <span className={cn("grid size-5 place-items-center rounded-full text-[11px]", step === item ? "bg-[#1c1b1a] text-white" : "bg-[#e7e2da]")}>
                  {index + 1}
                </span>
                {item === "design" ? "Design" : item === "audience" ? "Audience" : "Review and send"}
              </button>
            </li>
          ))}
        </ol>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setStep("review")}>
            Preview
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={sending} onClick={() => void send(true)}>
            Send test
          </Button>
          {step === "review" ? (
            <Button type="button" size="sm" disabled={sending || recipients.length === 0} onClick={() => void send(false)}>
              {sending ? "Sending…" : `Send to ${Math.min(recipients.length, EMAIL_CAMPAIGN_SEND_CAP)}`}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => setStep(step === "design" ? "audience" : "review")}>
              {step === "design" ? "Next: Audience" : "Next: Review"}
            </Button>
          )}
        </div>
      </header>

      {step === "design" ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
            <aside className="min-h-0 overflow-y-auto border-r border-[#e4dfd8] bg-[#f7f5f2] p-3">
              <div className="mb-3 flex rounded-md bg-[#ece8e2] p-0.5 text-xs">
                {(["blocks", "styles", "saved"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPanel(item)}
                    className={cn("flex-1 rounded px-2 py-1 capitalize", panel === item && "bg-white shadow-sm")}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {panel === "blocks" ? (
                <>
                  <p className="mb-2 text-[11px] text-[#8a8680]">Drag a block into the email.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {EMAIL_BLOCK_TYPES.map((type) => (
                      <PaletteButton key={type} type={type} onInsert={() => insertBlock(type)} />
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg border border-[#e7e4df] bg-white p-3">
                    <p className="text-xs font-medium">Brand kit applied</p>
                    <div className="mt-2 flex gap-1.5">
                      {["#d71c27", "#1c1b1a", "#1f6f5b", "#f4f1ea"].map((color) => (
                        <span key={color} className="size-4 rounded-sm border border-black/10" style={{ background: color }} />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#6f6a64]">
                      Source Serif headlines · Inter body · {crm.company.name}
                    </p>
                    <Link href="/marketing/settings" className="mt-1 inline-block text-[11px] text-primary">
                      Edit brand kit
                    </Link>
                  </div>
                </>
              ) : null}
              {panel === "styles" ? (
                <div className="space-y-3 text-sm">
                  <p className="text-[11px] text-[#8a8680]">Styles apply to every button already in this email.</p>
                  <label className="block text-xs text-[#6f6a64]">
                    Button color
                    <input
                      type="color"
                      className="mt-1 h-8 w-full"
                      defaultValue="#d71c27"
                      onChange={(event) => {
                        const color = event.target.value;
                        withDoc((current) => ({
                          ...current,
                          blocks: current.blocks.map((block) => (block.type === "button" ? { ...block, color } : block)),
                        }));
                      }}
                    />
                  </label>
                  <p className="text-xs leading-relaxed text-[#6f6a64]">
                    Headlines use the serif already on Marketing. Body copy stays in the sans used everywhere else in the CRM.
                  </p>
                </div>
              ) : null}
              {panel === "saved" ? (
                <div className="space-y-2">
                  {saved.length === 0 ? <p className="text-xs text-[#6f6a64]">Save a selected block from the inspector.</p> : null}
                  {saved.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-md border border-[#e7e4df] bg-white px-2 py-2 text-left text-xs"
                      onClick={() => {
                        const block = { ...item.block, id: emailBlockId() };
                        withDoc((current) => ({ ...current, blocks: [...current.blocks, block] }));
                        setSelectedId(block.id);
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </aside>

            <div className="min-h-0 overflow-y-auto bg-[#ebe6df] px-4 py-6">
              <div className="mb-4 flex justify-center">
                <div className="inline-flex rounded-full bg-white p-0.5 text-xs shadow-sm">
                  <button type="button" className={cn("rounded-full px-3 py-1", device === "desktop" && "bg-[#1c1b1a] text-white")} onClick={() => setDevice("desktop")}>
                    <Monitor className="mr-1 inline size-3.5" /> Desktop
                  </button>
                  <button type="button" className={cn("rounded-full px-3 py-1", device === "mobile" && "bg-[#1c1b1a] text-white")} onClick={() => setDevice("mobile")}>
                    <Smartphone className="mr-1 inline size-3.5" /> Mobile
                  </button>
                </div>
              </div>
              <Canvas
                doc={doc}
                device={device}
                selectedId={activeBlockId}
                companyName={crm.company.name}
                phone={crm.effectiveStaff?.phone || crm.company.phone}
                logoUrl={crm.company.logoUrl}
                repName={crm.effectiveStaff?.name || crm.user.name}
                onSelect={setSelectedId}
                onMove={(id, direction) => {
                  const index = doc.blocks.findIndex((block) => block.id === id);
                  const next = index + direction;
                  if (index < 0 || next < 0 || next >= doc.blocks.length) return;
                  patch({ blocks: arrayMove(doc.blocks, index, next) });
                }}
                onDuplicate={(id) => {
                  const index = doc.blocks.findIndex((block) => block.id === id);
                  const source = doc.blocks[index];
                  if (!source) return;
                  const copy = { ...source, id: emailBlockId() };
                  const blocks = [...doc.blocks];
                  blocks.splice(index + 1, 0, copy);
                  patch({ blocks });
                  setSelectedId(copy.id);
                }}
                onRemove={(id) => {
                  patch({ blocks: doc.blocks.filter((block) => block.id !== id) });
                  if (selectedId === id) setSelectedId(null);
                }}
              />
            </div>

            <aside className="min-h-0 overflow-y-auto border-l border-[#e4dfd8] bg-white p-4">
              {selected ? (
                <Inspector
                  block={selected}
                  onChange={(partial) => patchBlock(selected.id, partial)}
                  onSave={() => {
                    saveSavedEmailBlocks(companyId, [
                      { id: emailBlockId(), name: EMAIL_BLOCK_LABELS[selected.type], block: selected },
                      ...saved,
                    ]);
                    toast.success("Saved block");
                  }}
                />
              ) : (
                <p className="text-sm text-[#6f6a64]">Select a block to edit it.</p>
              )}
              <div className="mt-6 space-y-2 border-t border-[#eee] pt-4 text-xs">
                <label className="block text-[#6f6a64]">
                  Subject
                  <Input className="mt-1" value={doc.subject} onChange={(event) => patch({ subject: event.target.value })} />
                </label>
                <p>
                  Spam check <span className="float-right text-emerald-700">{spam.subject}</span>
                </p>
                <p>
                  Image-to-text balance <span className="float-right text-emerald-700">{spam.balance}</span>
                </p>
              </div>
            </aside>
          </div>
          <DragOverlay>
            {dragging?.startsWith("palette:") ? (
              <div className="rounded-md border bg-white px-3 py-2 text-xs shadow">
                {EMAIL_BLOCK_LABELS[dragging.slice("palette:".length) as EmailBlockType]}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}

      {step === "audience" ? (
        <div className="mx-auto min-h-0 w-full max-w-xl flex-1 space-y-4 overflow-y-auto p-6">
          <h2 className="font-heading text-2xl">Who gets this</h2>
          {(Object.keys(EMAIL_CAMPAIGN_AUDIENCE_LABELS) as EmailCampaignAudience[]).map((kind) => {
            const count = splitCampaignRecipients(
              resolveEmailCampaignAudience(kind, crm.contacts, crm.jobs, {
                city: doc.city,
                zip: doc.zip,
                includePunch: doc.includePunch,
              }),
              doc.excludedContactIds ?? [],
            ).sending.length;
            return (
              <label key={kind} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#e7e4df] bg-white px-3 py-3">
                <input type="radio" checked={doc.audienceKind === kind} onChange={() => patch({ audienceKind: kind })} />
                <span className="flex-1 text-sm">{EMAIL_CAMPAIGN_AUDIENCE_LABELS[kind]}</span>
                <span className="text-sm text-[#6f6a64]">{count}</span>
              </label>
            );
          })}
          {doc.audienceKind === "storm" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={doc.city} onChange={(event) => patch({ city: event.target.value })} />
              <Input placeholder="ZIP" value={doc.zip} onChange={(event) => patch({ zip: event.target.value })} />
            </div>
          ) : null}
          <div className="rounded-xl bg-[#1c1b1a] px-4 py-4 text-white">
            <p className="font-heading text-3xl">{Math.min(recipients.length, EMAIL_CAMPAIGN_SEND_CAP)}</p>
            <p className="text-sm text-white/70">
              recipients this send{recipients.length > EMAIL_CAMPAIGN_SEND_CAP ? ` · ${recipients.length} on the list` : ""}
              {audience.removed.length > 0 ? ` · ${audience.removed.length} removed` : ""}
            </p>
          </div>
          <RecipientRoster
            sending={recipients}
            removed={audience.removed}
            emptyHint={
              doc.audienceKind === "storm" && !doc.city.trim() && !doc.zip.trim()
                ? "Add a city or ZIP to see who is on this list."
                : "Nobody with an email is on this send."
            }
            onRemove={removeRecipient}
            onRestore={restoreRecipient}
          />
        </div>
      ) : null}

      {step === "review" ? (
        <div className="mx-auto grid min-h-0 w-full max-w-3xl flex-1 gap-4 overflow-y-auto p-6">
          <h2 className="font-heading text-2xl">Review and send</h2>
          <p className="text-sm text-[#6f6a64]">
            From {RESEND_FROM_ADDRESS}. Replies go to {crm.effectiveStaff?.email || "the email on your profile"}. Merge fields fill in for each person.
          </p>
          <RecipientRoster
            sending={recipients}
            removed={audience.removed}
            emptyHint="Nobody with an email is on this send."
            onRemove={removeRecipient}
            onRestore={restoreRecipient}
          />
          <div className="overflow-hidden rounded-xl border border-[#e7e4df] bg-white">
            <Canvas
              doc={doc}
              device="desktop"
              selectedId={null}
              companyName={crm.company.name}
              phone={crm.effectiveStaff?.phone || crm.company.phone}
              logoUrl={crm.company.logoUrl}
              repName={crm.effectiveStaff?.name || crm.user.name}
              onSelect={() => undefined}
              onMove={() => undefined}
              onDuplicate={() => undefined}
              onRemove={() => undefined}
              locked
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "?";
}

function RecipientRoster({
  sending,
  removed,
  emptyHint,
  onRemove,
  onRestore,
}: {
  sending: EmailCampaignRecipient[];
  removed: EmailCampaignRecipient[];
  emptyHint: string;
  onRemove: (contactId: string) => void;
  onRestore: (contactId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">Who is on this send</h3>
        <p className="text-xs text-[#8a8680]">
          {sending.length === 0 ? "No one yet" : `${sending.length} ${sending.length === 1 ? "person" : "people"}`}
        </p>
      </div>
      {sending.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#e7e4df] bg-white px-3 py-4 text-sm text-[#6f6a64]">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {sending.map((row, index) => {
            const pastCap = index >= EMAIL_CAMPAIGN_SEND_CAP;
            return (
              <li key={row.contactId} className="flex items-center gap-3 rounded-lg border border-[#e7e4df] bg-white px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f4f1ea] text-[11px] font-medium text-[#3f3c38]">
                  {initials(row.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    {pastCap ? <span className="shrink-0 text-[11px] text-[#8a8680]">Past the {EMAIL_CAMPAIGN_SEND_CAP} limit</span> : null}
                  </span>
                  <span className="block truncate text-xs text-[#6f6a64]">
                    {row.email}
                    {row.jobCity ? ` · ${row.jobCity}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-[#6f6a64] hover:bg-[#f6f3ee] hover:text-[#1c1b1a]"
                  onClick={() => onRemove(row.contactId)}
                >
                  <X className="size-3.5" />
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {removed.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[#6f6a64]">Removed from this send</h3>
          <ul className="space-y-2">
            {removed.map((row) => (
              <li key={row.contactId} className="flex items-center gap-3 rounded-lg border border-dashed border-[#e7e4df] bg-white/70 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[#6f6a64] line-through">{row.name}</span>
                  <span className="block truncate text-xs text-[#8a8680]">{row.email}</span>
                </span>
                <button type="button" className="shrink-0 text-xs font-medium text-primary" onClick={() => onRestore(row.contactId)}>
                  Add back
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PaletteButton({ type, onInsert }: { type: EmailBlockType; onInsert: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}` });
  const Icon = PALETTE_ICONS[type];
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={cn(
        "grid place-items-center gap-1 rounded-lg border border-[#e7e4df] bg-white px-1 py-2 text-[10px] text-[#3f3c38]",
        isDragging && "opacity-40",
      )}
      onClick={onInsert}
      {...listeners}
      {...attributes}
    >
      <Icon className="size-4" />
      {EMAIL_BLOCK_LABELS[type]}
    </button>
  );
}

function Canvas({
  doc,
  device,
  selectedId,
  companyName,
  phone,
  logoUrl,
  repName,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  locked = false,
}: {
  doc: EmailDocument;
  device: "desktop" | "mobile";
  selectedId: string | null;
  companyName: string;
  phone: string;
  logoUrl?: string;
  repName: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  locked?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "email-canvas" });

  return (
    <div className={cn("mx-auto", device === "mobile" ? "max-w-[380px]" : "max-w-[640px]")}>
      <article ref={setNodeRef} className={cn("bg-white shadow-sm", isOver && "ring-2 ring-primary")}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 text-[12px] text-[#8a8680]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 max-w-[140px] object-contain" />
          ) : (
            <span className="tracking-[0.14em] uppercase">{companyName}</span>
          )}
          <span>{phone}</span>
        </div>
        <div className="h-[3px] bg-primary" />
        <SortableContext items={doc.blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1 px-6 py-6">
            {doc.blocks.length === 0 ? (
              <p className="py-16 text-center text-sm text-[#8a8680]">Drop a block here.</p>
            ) : null}
            {doc.blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                selected={block.id === selectedId}
                locked={locked}
                repName={repName}
                phone={phone}
                onSelect={() => onSelect(block.id)}
                onMove={onMove}
                onDuplicate={onDuplicate}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
        <p className="bg-[#fafafa] px-6 py-4 text-center text-[11px] leading-relaxed text-[#8a8680]">
          {companyName}
          <br />
          You&apos;re getting this because you&apos;re a customer. Unsubscribe
        </p>
      </article>
    </div>
  );
}

function SortableBlock({
  block,
  selected,
  locked,
  repName,
  phone,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: EmailBlock;
  selected: boolean;
  locked: boolean;
  repName: string;
  phone: string;
  onSelect: () => void;
  onMove: (id: string, direction: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: locked });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      data-block-id={block.id}
      style={style}
      className={cn("group relative rounded-sm", selected && "ring-2 ring-primary", isDragging && "opacity-50")}
      onClick={onSelect}
    >
      {selected && !locked ? (
        <div className="absolute -top-3 right-2 z-10 flex gap-1 rounded-md bg-primary p-0.5 text-white">
          <button type="button" className="p-1" aria-label="Move up" onClick={() => onMove(block.id, -1)}>
            <ArrowUp className="size-3" />
          </button>
          <button type="button" className="p-1" aria-label="Move down" onClick={() => onMove(block.id, 1)}>
            <ArrowDown className="size-3" />
          </button>
          <button type="button" className="cursor-grab p-1" aria-label="Drag block" {...listeners} {...attributes}>
            <GripVertical className="size-3" />
          </button>
          <button type="button" className="p-1" aria-label="Duplicate" onClick={() => onDuplicate(block.id)}>
            <Copy className="size-3" />
          </button>
          <button type="button" className="p-1" aria-label="Remove" onClick={() => onRemove(block.id)}>
            <Trash2 className="size-3" />
          </button>
        </div>
      ) : null}
      <BlockView block={block} repName={repName} phone={phone} />
    </div>
  );
}

function MergeText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.startsWith("{{") ? (
          <span key={index} className="text-[#d23b45]">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}

function BlockView({ block, repName, phone }: { block: EmailBlock; repName: string; phone: string }) {
  if (block.type === "text") {
    if (block.role === "headline") {
      return (
        <h2 className="font-heading py-2 text-[1.85rem] leading-tight font-medium">
          <MergeText text={block.text} />
        </h2>
      );
    }
    if (block.role === "kicker") {
      return <p className="py-2 text-[11px] tracking-[0.16em] text-[#8a8680] uppercase">{block.text}</p>;
    }
    return (
      <p className={cn("py-1 text-[15px] leading-relaxed whitespace-pre-wrap text-[#3f3c38]", block.align === "center" && "text-center")}>
        <MergeText text={block.text} />
      </p>
    );
  }
  if (block.type === "image") {
    return block.url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={block.url} alt={block.alt} className="my-2 w-full" />
    ) : (
      <div className="my-2 grid h-36 place-items-center bg-[#ece7df] text-xs text-[#8a847a]">{block.alt || "Photo"}</div>
    );
  }
  if (block.type === "button") {
    return (
      <div className="py-3 text-center">
        <span
          className={cn("inline-block rounded-md px-6 py-3 text-sm font-semibold text-white", block.width === "full" && "w-full")}
          style={{ background: block.color }}
        >
          {block.label}
        </span>
      </div>
    );
  }
  if (block.type === "job_photos" || block.type === "before_after") {
    return (
      <div className="grid grid-cols-3 gap-2 py-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="grid h-20 place-items-center bg-[#ece7df] text-[11px] text-[#8a847a]">
            {block.caption} {n}
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "review") {
    return (
      <div className="my-2 rounded-md bg-[#f6f4f1] p-3">
        <p className="text-amber-500">{"★".repeat(block.stars)}</p>
        <p className="mt-1 text-sm">{block.quote}</p>
        <p className="mt-1 text-[11px] text-[#8a8680]">{block.name}</p>
      </div>
    );
  }
  if (block.type === "rep_card") {
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="grid size-10 place-items-center rounded-full bg-[#1c1b1a] text-xs text-white">
          {repName.slice(0, 2).toUpperCase()}
        </span>
        <span>
          <MergeText text="{{repName}}" className="block text-sm font-medium" />
          <span className="text-sm text-primary">{phone || "{{repPhone}}"}</span>
        </span>
      </div>
    );
  }
  if (block.type === "divider") return <hr className="my-3 border-[#e7e5e4]" />;
  if (block.type === "spacer") return <div style={{ height: block.height }} />;
  if (block.type === "columns") {
    return (
      <div className="grid grid-cols-2 gap-3 py-2 text-sm text-[#3f3c38]">
        <p>{block.left}</p>
        <p>{block.right}</p>
      </div>
    );
  }
  if (block.type === "video") return <p className="py-2 text-sm text-primary">{block.url || "Video link"}</p>;
  return <p className="py-2 text-xs tracking-wide text-[#8a8680] uppercase">Facebook · Instagram · Google</p>;
}

function Inspector({
  block,
  onChange,
  onSave,
}: {
  block: EmailBlock;
  onChange: (partial: Partial<EmailBlock>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-[0.14em] text-[#8a8680] uppercase">{EMAIL_BLOCK_LABELS[block.type]}</p>
        <button type="button" className="text-[11px] text-primary" onClick={onSave}>
          Save block
        </button>
      </div>
      {block.type === "text" ? (
        <>
          <label className="block text-xs text-[#6f6a64]">
            Style
            <select
              className="mt-1 h-8 w-full rounded-md border px-2 text-sm"
              value={block.role}
              onChange={(event) => onChange({ role: event.target.value as "headline" | "kicker" | "body" })}
            >
              <option value="headline">Headline</option>
              <option value="body">Body</option>
              <option value="kicker">Small label</option>
            </select>
          </label>
          <Textarea value={block.text} onChange={(event) => onChange({ text: event.target.value })} rows={6} />
          <div className="flex flex-wrap gap-1">
            {MERGE_FIELDS.map((field) => (
              <button
                key={field}
                type="button"
                className="rounded-full border px-2 py-0.5 text-[11px] text-primary"
                onClick={() => onChange({ text: `${block.text}${block.text.endsWith(" ") || !block.text ? "" : " "}${field}` })}
              >
                {field}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {block.type === "button" ? (
        <>
          <label className="block text-xs">
            Button text
            <Input className="mt-1" value={block.label} onChange={(event) => onChange({ label: event.target.value })} />
          </label>
          <label className="block text-xs">
            Links to
            <Input className="mt-1" value={block.href} onChange={(event) => onChange({ href: event.target.value })} />
          </label>
          <label className="block text-xs">
            Color
            <input type="color" className="mt-1 h-8 w-full" value={block.color} onChange={(event) => onChange({ color: event.target.value })} />
          </label>
          <div className="flex rounded-md bg-[#f4f3f1] p-0.5 text-xs">
            <button type="button" className={cn("flex-1 rounded py-1", block.width === "fit" && "bg-[#1c1b1a] text-white")} onClick={() => onChange({ width: "fit" })}>
              Fit text
            </button>
            <button type="button" className={cn("flex-1 rounded py-1", block.width === "full" && "bg-[#1c1b1a] text-white")} onClick={() => onChange({ width: "full" })}>
              Full width
            </button>
          </div>
          <label className="flex items-start gap-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-900">
            <input type="checkbox" checked={block.trackInspection} onChange={(event) => onChange({ trackInspection: event.target.checked })} />
            Count clicks as an inspection request and create a lead
          </label>
        </>
      ) : null}
      {block.type === "image" ? (
        <>
          <Input placeholder="Image URL" value={block.url} onChange={(event) => onChange({ url: event.target.value })} />
          <Input placeholder="Description" value={block.alt} onChange={(event) => onChange({ alt: event.target.value })} />
        </>
      ) : null}
      {block.type === "review" ? (
        <>
          <Textarea value={block.quote} onChange={(event) => onChange({ quote: event.target.value })} />
          <Input value={block.name} onChange={(event) => onChange({ name: event.target.value })} />
        </>
      ) : null}
      {block.type === "columns" ? (
        <>
          <Textarea value={block.left} onChange={(event) => onChange({ left: event.target.value })} />
          <Textarea value={block.right} onChange={(event) => onChange({ right: event.target.value })} />
        </>
      ) : null}
      {(block.type === "job_photos" || block.type === "before_after") && (
        <Input value={block.caption} onChange={(event) => onChange({ caption: event.target.value })} />
      )}
      {block.type === "video" ? <Input placeholder="Video URL" value={block.url} onChange={(event) => onChange({ url: event.target.value })} /> : null}
      {block.type === "spacer" ? (
        <label className="block text-xs">
          Height
          <input type="range" min={8} max={96} value={block.height} onChange={(event) => onChange({ height: Number(event.target.value) })} className="mt-2 w-full" />
        </label>
      ) : null}
      {block.type === "divider" ? <p className="text-xs text-[#6f6a64]">A horizontal rule between sections.</p> : null}
      {block.type === "rep_card" || block.type === "social" ? (
        <p className="text-xs text-[#6f6a64]">This block fills in from the company and the rep on the send.</p>
      ) : null}
    </div>
  );
}

function spamCheck(doc: EmailDocument) {
  const subject = doc.subject.trim();
  const shout = subject === subject.toUpperCase() && /[A-Z]/.test(subject);
  const images = doc.blocks.filter((block) => block.type === "image" || block.type === "job_photos" || block.type === "before_after").length;
  const words = emailDocumentPlainText(doc).split(/\s+/).filter(Boolean).length;
  return {
    subject: !subject || shout || (subject.match(/!/g) || []).length > 2 ? "Check subject" : "Looks good",
    balance: images > 0 && words < 20 ? "Add text" : "OK",
  };
}
