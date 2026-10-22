"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type FormEvent, type RefObject } from "react";
import {
  Camera,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  Info,
  Loader2,
  Mail,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { GoogleLocationSelect } from "@/components/google-locations-settings";
import { PhoneInput } from "@/components/phone-input";
import { TeamSelect } from "@/components/teams-settings";
import { inviteExpiry, inviteIsExpired, inviteIsPending } from "@/lib/accounts";
import { cardUrl } from "@/lib/card";
import { normalizePersonCardSlug } from "@/lib/card-slug";
import { LOGO_ACCEPT, LOGO_MAX_BYTES, validateLogoFile } from "@/lib/company-logo";
import { useCrm } from "@/lib/crm-store";
import { formatMoney, initials } from "@/lib/format";
import {
  PROFILE_TABS,
  cardSlugAliasesAfterSave,
  cardSlugTakenMessage,
  chatEmbedDisplay,
  chatSiteLabel,
  chicagoDate,
  chicagoMonth,
  draftFromMember,
  fillSignature,
  firstName,
  latestWebsiteChatAt,
  mismatchedSignaturePhone,
  parseCardSlugAliases,
  photoTooLargeMessage,
  possessive,
  profileChanges,
  profileFieldErrors,
  replaceMismatchedPhone,
  roleBookHelp,
  suggestFreeCardSlug,
  takenCardSlugs,
  type ProfileDraft,
  type ProfileTab,
} from "@/lib/profile-editor";
import { effectiveMonthlyQuota, soldThisMonth } from "@/lib/sales-goal";
import { copyText } from "@/lib/share";
import { toast } from "sonner";
import { parseTeamSelect } from "@/lib/teams";
import type { GoogleLocation, SeatRole, StaffMember, Team } from "@/lib/types";
import { SEAT_ROLE_LABELS, SEAT_ROLES } from "@/lib/types";
import { cn } from "@/lib/utils";

const AVATAR_TONES = [
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-900",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
];

const FIELD = "h-10 rounded-lg bg-white px-3";
const ROLE_ITEMS = SEAT_ROLES.map((role) => ({ value: role, label: SEAT_ROLE_LABELS[role] }));

export type ProfileSavePatch = {
  name: string;
  title: string;
  email: string;
  phone: string;
  role: SeatRole;
  teamId: string | null;
  cardSlug: string;
  cardSlugAliases: string[];
  googleLocationId: string | null;
  emailSignature: string;
  monthlySalesQuota: number | null;
};

function avatarTone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}

function useOrigin() {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
}

export function ProfileEditor({
  member,
  viewerId,
  companySlug,
  teams,
  googleLocations,
  companySignature,
  onOpenChange,
  onSave,
  onCopyInvite,
  onResendInvite,
  onRevokeInvite,
  onAskRemove,
}: {
  member: StaffMember | null;
  viewerId: string;
  companySlug: string;
  teams: Team[];
  googleLocations: GoogleLocation[];
  companySignature: string;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: ProfileSavePatch) => Promise<boolean>;
  onCopyInvite: (member: StaffMember) => Promise<void>;
  onResendInvite: (member: StaffMember) => Promise<boolean>;
  onRevokeInvite: (member: StaffMember) => Promise<boolean>;
  onAskRemove: (member: StaffMember) => void;
}) {
  const crm = useCrm();
  const open = Boolean(member);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [baseline, setBaseline] = useState<ProfileDraft | null>(null);
  const [tab, setTab] = useState<ProfileTab>("details");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [keepRedirect, setKeepRedirect] = useState(true);
  const [resentExpires, setResentExpires] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState<"copy" | "resend" | "revoke" | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ name: string; progress: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelUpload = useRef(false);
  const signatureRef = useRef<HTMLTextAreaElement>(null);
  const origin = useOrigin();

  if (open && member && openedFor !== member.id) {
    const next = draftFromMember(member);
    setOpenedFor(member.id);
    setDraft(next);
    setBaseline(next);
    setTab("details");
    setSubmitted(false);
    setSavedAt(null);
    setConfirmOpen(false);
    setKeepRedirect(true);
    setResentExpires(null);
    setInviteBusy(null);
    setPhotoError(null);
    setUpload(null);
    setCopied(false);
  } else if (!open && openedFor) {
    setOpenedFor(null);
  }

  const companyQuota = crm.company.defaultMonthlySalesQuota ?? 0;
  const taken = useMemo(
    () => takenCardSlugs(crm.book.staff, member?.id ?? ""),
    [crm.book.staff, member?.id],
  );
  const sold = useMemo(() => {
    if (!member) return 0;
    return soldThisMonth({
      jobs: crm.book.jobs,
      estimates: crm.book.estimates,
      estimateLines: crm.book.estimateLines,
      opportunities: crm.book.opportunities,
      staff: crm.book.staff,
      ownerIds: new Set([member.id]),
    });
  }, [crm.book, member]);
  const chatAt = member ? latestWebsiteChatAt(crm.book.opportunities, member.id) : null;

  const changes =
    draft && baseline ? profileChanges(draft, baseline, { teams, locations: googleLocations }) : [];
  const formatErrors = draft ? profileFieldErrors(draft) : {};
  const normalizedSlug = draft?.cardSlug.trim() ? normalizePersonCardSlug(draft.cardSlug) : "";
  const baselineSlug = baseline?.cardSlug.trim() ? normalizePersonCardSlug(baseline.cardSlug) : "";
  const slugTaken = Boolean(normalizedSlug && normalizedSlug !== baselineSlug && taken.has(normalizedSlug));
  const slugTakenText = slugTaken
    ? cardSlugTakenMessage(normalizedSlug, suggestFreeCardSlug(normalizedSlug, taken))
    : undefined;
  const errors = {
    name: submitted ? formatErrors.name : undefined,
    phone: submitted ? formatErrors.phone : undefined,
    email: submitted ? formatErrors.email : undefined,
    cardSlug: slugTakenText ?? (submitted ? formatErrors.cardSlug : undefined),
  };
  const errorCount = [errors.name, errors.phone, errors.email, errors.cardSlug].filter(Boolean).length;
  const dirty = changes.length > 0;
  const limited = Boolean(member && member.id === viewerId && member.role !== "company_admin");
  const month = chicagoMonth();

  function patchDraft(patch: Partial<ProfileDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSavedAt(null);
  }

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function revealErrors() {
    const first = (["name", "phone", "email"] as const).find((key) => formatErrors[key]) ?? (errors.cardSlug ? "cardSlug" : null);
    if (!first) return;
    setTab(first === "cardSlug" ? "card" : "details");
    window.setTimeout(() => {
      document.getElementById(first === "cardSlug" ? "profile-card-slug" : `profile-${first}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 40);
  }

  async function save(closeAfter: boolean) {
    if (!member || !draft || pending) return;
    const invalid = Boolean(formatErrors.name || formatErrors.phone || formatErrors.email || formatErrors.cardSlug || slugTaken);
    if (invalid) {
      setSubmitted(true);
      setConfirmOpen(false);
      revealErrors();
      return;
    }
    setPending(true);
    try {
      const ok = await onSave({
        name: draft.name.trim(),
        title: draft.title.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        role: draft.role,
        teamId: parseTeamSelect(draft.teamId),
        cardSlug: normalizePersonCardSlug(draft.cardSlug),
        cardSlugAliases: cardSlugAliasesAfterSave({
          previousSlug: baseline?.cardSlug ?? member.cardSlug,
          previousAliases: parseCardSlugAliases(member.cardSlugAliases),
          nextSlug: draft.cardSlug,
          keepRedirect,
        }),
        googleLocationId: draft.locationId,
        emailSignature: draft.signature,
        monthlySalesQuota: draft.quota.trim() === "" ? null : Math.max(0, Number(draft.quota) || 0),
      });
      if (!ok) return;
      const saved = { ...draft, cardSlug: normalizePersonCardSlug(draft.cardSlug) };
      setDraft(saved);
      setBaseline(saved);
      setSubmitted(false);
      setSavedAt(Date.now());
      setConfirmOpen(false);
      if (closeAfter) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await save(false);
  }

  async function pickPhoto(file: File) {
    if (!member) return;
    if (file.size > LOGO_MAX_BYTES) {
      setPhotoError(photoTooLargeMessage(file.size));
      return;
    }
    const invalid = validateLogoFile(file);
    if (invalid) {
      setPhotoError(invalid);
      return;
    }
    setPhotoError(null);
    cancelUpload.current = false;
    setUpload({ name: file.name, progress: 8 });
    const timer = window.setInterval(() => {
      setUpload((current) => (current ? { ...current, progress: Math.min(90, current.progress + 8) } : current));
    }, 180);
    try {
      const ok = await crm.uploadStaffPhoto(member.id, file);
      if (cancelUpload.current) {
        if (ok) await crm.removeStaffPhoto(member.id);
        return;
      }
      if (!ok) setPhotoError("Could not upload that photo. Try a smaller JPG or PNG.");
    } finally {
      window.clearInterval(timer);
      setUpload(null);
    }
  }

  function onDropPhoto(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void pickPhoto(file);
  }

  function insertToken(token: string) {
    if (!draft) return;
    const needle = `{${token}}`;
    const node = signatureRef.current;
    const start = node?.selectionStart ?? draft.signature.length;
    const end = node?.selectionEnd ?? start;
    const next = `${draft.signature.slice(0, start)}${needle}${draft.signature.slice(end)}`;
    patchDraft({ signature: next });
    window.requestAnimationFrame(() => {
      node?.focus();
      const pos = start + needle.length;
      node?.setSelectionRange(pos, pos);
    });
  }

  const given = member ? firstName(member.name) : "";
  const pendingInvite = member ? inviteIsPending(member) : false;
  const expiredInvite = member ? pendingInvite && inviteIsExpired(member) : false;
  const slugChanged = Boolean(normalizedSlug && baselineSlug && normalizedSlug !== baselineSlug);
  const quotaAmount =
    draft && member
      ? effectiveMonthlyQuota(
          { monthlySalesQuota: draft.quota.trim() === "" ? null : Number(draft.quota) || 0 },
          { defaultMonthlySalesQuota: companyQuota },
        )
      : 0;
  const goalPct = quotaAmount > 0 ? Math.min(100, Math.round((sold / quotaAmount) * 100)) : 0;
  const usingDefaultGoal = !draft?.quota.trim();
  const signaturePerson = {
    name: draft?.name.trim() || member?.name || "",
    title: draft?.title.trim() || "",
    phone: draft?.phone || "",
    email: draft?.email.trim() || "",
  };
  const signaturePreview = fillSignature(draft?.signature.trim() ? draft.signature : companySignature, signaturePerson);
  const phoneMismatch =
    draft?.signature.trim() ? mismatchedSignaturePhone(draft.signature, draft.phone) : null;
  const snippet = origin ? chatEmbedDisplay(origin, companySlug, member?.id ?? "") : "";
  const cardPrefix =
    origin && companySlug ? `${origin.replace(/^https?:\/\//, "")}/${companySlug}/card/` : "[card link]/";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next, details) => {
          if (next) return;
          if (pending || dirty) {
            details.cancel();
            if (dirty && !pending) setConfirmOpen(true);
            return;
          }
          onOpenChange(false);
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full! gap-0 overflow-hidden border-l bg-[#f6f4f1] p-0 data-[side=right]:w-full! data-[side=right]:max-w-[760px]! data-[side=right]:sm:max-w-[760px]!"
          style={{ width: "min(100vw, 760px)", maxWidth: "min(100vw, 760px)" }}
        >
          {member && draft ? (
            <form onSubmit={(event) => void onSubmit(event)} className="flex h-full min-h-0 flex-col">
              <SheetTitle className="sr-only">Profile for {member.name}</SheetTitle>
              <SheetDescription className="sr-only">
                Name, card, sales goal, signature, and website chat for {member.name}.
              </SheetDescription>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <section className="rounded-2xl border border-[#ece7e2] bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <ProfileAvatar member={member} dashed={pendingInvite && !expiredInvite && !member.photoUrl?.trim()} />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="truncate text-2xl font-semibold tracking-tight">{draft.name.trim() || member.name}</h2>
                        <button
                          type="button"
                          className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#e4dfd9] text-neutral-700 hover:bg-[#f6f4f1]"
                          onClick={requestClose}
                          aria-label="Close profile"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {draft.title.trim() ? <span className="text-sm text-neutral-600">{draft.title.trim()}</span> : null}
                        <RolePill role={draft.role} />
                        <StatusPill member={member} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-5 border-b border-[#efeae6]" role="tablist" aria-label="Profile sections">
                    {PROFILE_TABS.map((item) => {
                      const active = tab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={cn(
                            "-mb-px border-b-[3px] pb-2.5 text-sm",
                            active
                              ? "border-[#d71c27] font-semibold text-neutral-950"
                              : "border-transparent text-neutral-500 hover:text-neutral-800",
                          )}
                          onClick={() => setTab(item.id)}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {resentExpires || pendingInvite ? (
                  <section className="rounded-2xl border border-[#ece7e2] bg-white p-3 shadow-sm">
                    {resentExpires ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                        <Check className="size-4 text-emerald-700" />
                        <p>
                          <span className="font-semibold">New invite sent.</span> Expires {chicagoDate(resentExpires)}.
                        </p>
                      </div>
                    ) : member ? (
                      <InviteBanner
                    member={member}
                    expired={expiredInvite}
                    given={given}
                    busy={inviteBusy}
                    onCopy={() => {
                      setInviteBusy("copy");
                      void onCopyInvite(member).finally(() => setInviteBusy(null));
                    }}
                    onResend={() => {
                      setInviteBusy("resend");
                      void onResendInvite(member)
                        .then((ok) => {
                          if (ok) setResentExpires(inviteExpiry());
                        })
                        .finally(() => setInviteBusy(null));
                    }}
                    onRevoke={() => {
                      setInviteBusy("revoke");
                      void onRevokeInvite(member)
                        .then((ok) => {
                          if (ok) setResentExpires(null);
                        })
                        .finally(() => setInviteBusy(null));
                    }}
                  />
                    ) : null}
                  </section>
                ) : null}

                <section className="rounded-2xl border border-[#ece7e2] bg-white p-5 shadow-sm" role="tabpanel">
                  {tab === "details" ? (
                    <DetailsTab
                      draft={draft}
                      teams={teams}
                      errors={errors}
                      limited={limited}
                      onChange={patchDraft}
                    />
                  ) : null}
                  {tab === "card" ? (
                    <CardTab
                      member={member}
                      draft={draft}
                      companySlug={companySlug}
                      origin={origin}
                      prefix={cardPrefix}
                      locations={googleLocations}
                      error={errors.cardSlug}
                      slugChanged={slugChanged}
                      previousSlug={baselineSlug}
                      keepRedirect={keepRedirect}
                      photoError={photoError}
                      upload={upload}
                      onChange={patchDraft}
                      onKeepRedirect={setKeepRedirect}
                      onPick={(file) => void pickPhoto(file)}
                      onDrop={onDropPhoto}
                      onCancelUpload={() => {
                        cancelUpload.current = true;
                        setUpload(null);
                      }}
                      onRemovePhoto={() => void crm.removeStaffPhoto(member.id)}
                    />
                  ) : null}
                  {tab === "goal" ? (
                    <GoalTab
                      draft={draft}
                      month={month}
                      sold={sold}
                      companyQuota={companyQuota}
                      quotaAmount={quotaAmount}
                      pct={goalPct}
                      usingDefault={usingDefaultGoal}
                      onChange={patchDraft}
                    />
                  ) : null}
                  {tab === "signature" ? (
                    <SignatureTab
                      member={member}
                      draft={draft}
                      given={given}
                      companySignature={companySignature}
                      preview={signaturePreview}
                      phoneMismatch={phoneMismatch}
                      textareaRef={signatureRef}
                      onChange={patchDraft}
                      onInsert={insertToken}
                      onUsePhoneToken={() => patchDraft({ signature: replaceMismatchedPhone(draft.signature, draft.phone) })}
                    />
                  ) : null}
                  {tab === "chat" ? (
                    <ChatTab
                      snippet={snippet}
                      copied={copied}
                      liveAt={chatAt}
                      site={chatSiteLabel(crm.company.website)}
                      locked={member.locked}
                      onCopy={() => {
                        void copyText(snippet).then((ok) => {
                          if (!ok) {
                            toast.error("Could not copy the code. Select it and copy it yourself.");
                            return;
                          }
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 2000);
                        });
                      }}
                    />
                  ) : null}
                </section>
              </div>

              <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#ece7e2] bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {!dirty && member.id !== viewerId ? (
                    <button
                      type="button"
                      className="text-sm font-semibold text-primary hover:underline"
                      onClick={() => onAskRemove(member)}
                    >
                      Remove seat
                    </button>
                  ) : null}
                  <FooterStatus
                    pending={pending}
                    errorCount={submitted ? errorCount : 0}
                    dirtyCount={changes.length}
                    savedAt={savedAt}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" variant="outline" className="h-10 rounded-lg px-4" onClick={requestClose} disabled={pending}>
                    {dirty ? "Cancel" : "Close"}
                  </Button>
                  <Button
                    type="submit"
                    nativeButton
                    disabled={!dirty || pending}
                    className={cn(
                      "h-10 rounded-lg px-4",
                      pending
                        ? "disabled:bg-primary/55 disabled:text-white disabled:opacity-100"
                        : "disabled:bg-[#eceae6] disabled:text-neutral-400 disabled:opacity-100",
                    )}
                  >
                    {pending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save profile"
                    )}
                  </Button>
                </div>
              </footer>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-2xl p-0 sm:max-w-lg" showCloseButton={false}>
          <div className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Save changes to {possessive(given)} profile?
            </DialogTitle>
            <DialogDescription className="mt-2 text-neutral-600">
              You changed {changes.length} {changes.length === 1 ? "thing" : "things"} that {changes.length === 1 ? "hasn’t" : "haven’t"} been saved:
            </DialogDescription>
            <ul className="mt-4 grid gap-2">
              {changes.map((change) => (
                <li key={change.key} className="flex items-center justify-between gap-4 rounded-xl bg-[#f6f4f1] px-4 py-3 text-sm">
                  <span className="text-neutral-500">{change.label}</span>
                  <span className="min-w-0 text-right">
                    {change.from} <span aria-hidden>→</span> {change.to}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-b-2xl border-t bg-[#f7f5f2] px-6 py-4">
            <button type="button" className="text-sm font-semibold text-primary" onClick={() => { setConfirmOpen(false); onOpenChange(false); }}>
              Discard
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => setConfirmOpen(false)}>
                Keep editing
              </Button>
              <Button type="button" className="h-10 rounded-lg" disabled={pending} onClick={() => void save(true)}>
                Save profile
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProfileAvatar({ member, dashed }: { member: StaffMember; dashed: boolean }) {
  const photo = member.photoUrl?.trim() ?? "";
  const letters = initials(member.name) || "?";
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="size-14 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      className={cn(
        "grid size-14 shrink-0 place-items-center rounded-full text-sm font-semibold",
        dashed ? "border border-dashed border-neutral-300 text-neutral-500" : avatarTone(member.name),
      )}
    >
      {letters}
    </div>
  );
}

function RolePill({ role }: { role: SeatRole }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        role === "company_admin" && "bg-neutral-950 text-white",
        role === "project_manager" && "bg-sky-100 text-sky-900",
        role === "business_development" && "bg-violet-100 text-violet-900",
        role === "accountant" && "bg-amber-100 text-amber-950",
        role !== "company_admin" &&
          role !== "project_manager" &&
          role !== "business_development" &&
          role !== "accountant" &&
          "bg-[#f3f1ee] text-neutral-700",
      )}
    >
      {SEAT_ROLE_LABELS[role]}
    </span>
  );
}

function StatusPill({ member }: { member: StaffMember }) {
  const pending = inviteIsPending(member);
  const expired = pending && inviteIsExpired(member);
  const locked = member.locked;
  const label = expired ? "Invite expired" : pending ? "Invite pending" : locked ? "Locked" : "Active";
  const tone = expired || locked ? "rose" : pending ? "amber" : "green";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "green" && "bg-emerald-100 text-emerald-800",
        tone === "amber" && "bg-amber-100 text-amber-800",
        tone === "rose" && "bg-rose-100 text-rose-700",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "green" && "bg-emerald-500",
          tone === "amber" && "bg-amber-500",
          tone === "rose" && "bg-rose-500",
        )}
      />
      {label}
    </span>
  );
}

function InviteBanner({
  member,
  expired,
  given,
  busy,
  onCopy,
  onResend,
  onRevoke,
}: {
  member: StaffMember;
  expired: boolean;
  given: string;
  busy: "copy" | "resend" | "revoke" | null;
  onCopy: () => void;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const when = member.inviteExpiresAt ? chicagoDate(member.inviteExpiresAt) : "";
  if (expired) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-950">
        <p className="flex gap-2">
          <Clock3 className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Invite expired {when}.</span> {given} can’t sign in until you send a fresh link. Their profile and card still work.
          </span>
        </p>
        <Button type="button" className="mt-3 h-10 rounded-lg bg-[#7f1d1d] px-4 hover:bg-[#6b1818]" disabled={busy !== null} onClick={onResend}>
          {busy === "resend" ? "Sending..." : "Send a new invite"}
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <p className="flex gap-2">
        <Mail className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-semibold">Invite sent to {member.email || "no email yet"}.</span>{" "}
          The link works once{when ? ` and expires ${when}` : ""}.
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="h-10 rounded-lg bg-white" disabled={busy !== null || !member.email} onClick={onCopy}>
          Copy invite link
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-lg bg-white" disabled={busy !== null || !member.email} onClick={onResend}>
          {busy === "resend" ? "Sending..." : "Resend email"}
        </Button>
        <button type="button" className="px-2 text-sm font-semibold text-primary disabled:opacity-50" disabled={busy !== null} onClick={onRevoke}>
          {busy === "revoke" ? "Revoking..." : "Revoke"}
        </button>
      </div>
    </div>
  );
}

function FieldError({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
      <CircleAlert className="size-3.5" />
      {children}
    </p>
  );
}

function DetailsTab({
  draft,
  teams,
  errors,
  limited,
  onChange,
}: {
  draft: ProfileDraft;
  teams: Team[];
  errors: Partial<Record<"name" | "phone" | "email", string | undefined>>;
  limited: boolean;
  onChange: (patch: Partial<ProfileDraft>) => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500">DETAILS</p>
        <p className="mt-1 text-sm text-neutral-600">
          Name, title, and phone print on estimates and invoices for jobs they own.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={draft.name}
            aria-invalid={Boolean(errors.name)}
            className={FIELD}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-title">Title</Label>
          <Input
            id="profile-title"
            value={draft.title}
            className={FIELD}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-phone">Phone</Label>
          <PhoneInput
            id="profile-phone"
            value={draft.phone}
            aria-invalid={Boolean(errors.phone)}
            className={FIELD}
            onValueChange={(phone) => onChange({ phone })}
          />
          {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            type="email"
            value={draft.email}
            readOnly={limited}
            aria-invalid={Boolean(errors.email)}
            className={FIELD}
            onChange={(event) => onChange({ email: event.target.value })}
          />
          {errors.email ? <FieldError>{errors.email}</FieldError> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-role">Role</Label>
          <Select
            value={draft.role}
            disabled={limited}
            onValueChange={(value) => onChange({ role: String(value ?? draft.role) as SeatRole })}
            items={ROLE_ITEMS}
          >
            <SelectTrigger id="profile-role" disabled={limited} className="h-10 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEAT_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {SEAT_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-team">Team</Label>
          <TeamSelect
            id="profile-team"
            value={draft.teamId}
            teams={teams}
            onChange={(teamId) => onChange({ teamId })}
            full
            disabled={limited}
            triggerClassName="h-10 rounded-lg"
          />
        </div>
      </div>
      <div className="flex gap-2 rounded-xl bg-[#f6f4f1] px-3 py-3 text-sm text-neutral-600">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          {roleBookHelp(draft.role)}
          {limited ? " A company admin changes role, team, and the login email." : ""}
        </p>
      </div>
    </div>
  );
}

function CardTab({
  member,
  draft,
  prefix,
  locations,
  error,
  slugChanged,
  previousSlug,
  keepRedirect,
  photoError,
  upload,
  onChange,
  onKeepRedirect,
  onPick,
  onDrop,
  onCancelUpload,
  onRemovePhoto,
  companySlug,
  origin,
}: {
  member: StaffMember;
  draft: ProfileDraft;
  prefix: string;
  locations: GoogleLocation[];
  error?: string;
  slugChanged: boolean;
  previousSlug: string;
  keepRedirect: boolean;
  photoError: string | null;
  upload: { name: string; progress: number } | null;
  onChange: (patch: Partial<ProfileDraft>) => void;
  onKeepRedirect: (value: boolean) => void;
  onPick: (file: File) => void;
  onDrop: (event: DragEvent) => void;
  onCancelUpload: () => void;
  onRemovePhoto: () => void;
  companySlug: string;
  origin: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const photo = member.photoUrl?.trim() ?? "";
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500">DIGITAL CARD</p>
        <p className="mt-1 text-sm text-neutral-600">What homeowners see when they tap the NFC card or scan the QR code.</p>
      </div>
      <PhotoRow
        member={member}
        photo={photo}
        upload={upload}
        error={photoError}
        inputRef={inputRef}
        onPick={onPick}
        onDrop={onDrop}
        onCancelUpload={onCancelUpload}
        onRemove={onRemovePhoto}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="profile-card-slug">Card URL</Label>
        <div
          className={cn(
            "flex min-w-0 overflow-hidden rounded-lg border bg-white",
            error ? "border-primary" : slugChanged ? "border-neutral-800" : "border-input",
          )}
        >
          <span className="flex max-w-[46%] items-center truncate border-r bg-[#f6f4f1] px-3 text-xs text-neutral-500" title={prefix}>
            {prefix}
          </span>
          <input
            id="profile-card-slug"
            value={draft.cardSlug}
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
            onChange={(event) => onChange({ cardSlug: event.target.value })}
            onBlur={() => {
              if (draft.cardSlug.trim()) onChange({ cardSlug: normalizePersonCardSlug(draft.cardSlug) });
            }}
          />
          <button
            type="button"
            className="grid place-items-center px-3 text-neutral-500 hover:text-neutral-900"
            aria-label="Copy card link"
            onClick={() => {
              const slug = normalizePersonCardSlug(draft.cardSlug);
              if (!slug || !companySlug) return;
              void copyText(cardUrl(companySlug, slug, origin));
            }}
          >
            <Copy className="size-4" />
          </button>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {slugChanged && !error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
            <p>
              <span className="font-semibold">Printed cards still point to /{previousSlug}.</span> Anyone who taps an old card will hit a dead link.
            </p>
            <label className="mt-2 flex items-center gap-2">
              <Checkbox checked={keepRedirect} onCheckedChange={(checked) => onKeepRedirect(checked === true)} />
              <span>Keep /{previousSlug} redirecting to the new link</span>
            </label>
          </div>
        ) : null}
        {!error && !slugChanged ? (
          <p className="text-xs text-neutral-500">Format is first.last. Changing this breaks printed NFC cards and QR codes.</p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="profile-location">Google location</Label>
        <GoogleLocationSelect
          id="profile-location"
          value={draft.locationId}
          locations={locations}
          onChange={(locationId) => onChange({ locationId })}
          full
          triggerClassName="h-10 rounded-lg"
        />
        <p className="text-xs text-neutral-500">
          Which listing the review button on their card opens.{" "}
          <Link href="/settings/locations" className="font-medium text-primary hover:underline">
            Manage locations
          </Link>
        </p>
      </div>
    </div>
  );
}

function PhotoRow({
  member,
  photo,
  upload,
  error,
  inputRef,
  onPick,
  onDrop,
  onCancelUpload,
  onRemove,
}: {
  member: StaffMember;
  photo: string;
  upload: { name: string; progress: number } | null;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
  onDrop: (event: DragEvent) => void;
  onCancelUpload: () => void;
  onRemove: () => void;
}) {
  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
      {upload ? (
        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
            {upload.progress}%
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{upload.name}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ece7e2]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${upload.progress}%` }} />
            </div>
            <button type="button" className="mt-1 text-xs text-neutral-500 underline" onClick={onCancelUpload}>
              Cancel upload
            </button>
          </div>
        </div>
      ) : photo ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className="size-14 rounded-full object-cover" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" className="h-9 rounded-lg" onClick={() => inputRef.current?.click()}>
                Replace photo
              </Button>
              <button type="button" className="px-1 text-sm font-semibold text-primary" onClick={onRemove}>
                Remove
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">Square headshot under 2 MB. Saves as soon as you pick it.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-full border border-dashed border-neutral-300 text-neutral-400">
            <Camera className="size-5" />
          </div>
          <div>
            <Button type="button" className="h-9 rounded-lg" onClick={() => inputRef.current?.click()}>
              Add photo
            </Button>
            <p className="mt-1 text-xs text-neutral-500">
              Or drop an image here. {firstName(member.name)}’s card shows initials until then.
            </p>
          </div>
        </div>
      )}
      {error ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-primary">
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

function GoalTab({
  draft,
  month,
  sold,
  companyQuota,
  quotaAmount,
  pct,
  usingDefault,
  onChange,
}: {
  draft: ProfileDraft;
  month: string;
  sold: number;
  companyQuota: number;
  quotaAmount: number;
  pct: number;
  usingDefault: boolean;
  onChange: (patch: Partial<ProfileDraft>) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500">SALES GOAL</p>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            usingDefault ? "bg-[#f3f1ee] text-neutral-600" : "bg-sky-100 text-sky-900",
          )}
        >
          {usingDefault ? "Company default" : "Custom"}
        </span>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="profile-quota">Monthly sales quota</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <CurrencyInput
            id="profile-quota"
            value={usingDefault ? companyQuota : draft.quota}
            disabled={usingDefault}
            className={cn(FIELD, "sm:max-w-sm", usingDefault && "disabled:bg-[#f3f1ee] disabled:opacity-100")}
            onValueChange={(quota) => onChange({ quota })}
          />
          {usingDefault ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg"
              onClick={() => onChange({ quota: String(companyQuota || 0) })}
            >
              Set a custom goal
            </Button>
          ) : (
            <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => onChange({ quota: "" })}>
              Reset to default
            </Button>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>{month} so far</span>
          <span className="text-neutral-500">
            {formatMoney(sold)} of {formatMoney(quotaAmount)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ece7e2]">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {usingDefault ? (
            <>
              Change the default for everyone in{" "}
              <Link href="/settings#company-default-quota" className="font-medium text-primary hover:underline">
                Company profile
              </Link>
              .
            </>
          ) : (
            "Overrides the company default on their Home goal bar."
          )}
        </p>
      </div>
    </div>
  );
}

function SignatureTab({
  member,
  draft,
  given,
  companySignature,
  preview,
  phoneMismatch,
  textareaRef,
  onChange,
  onInsert,
  onUsePhoneToken,
}: {
  member: StaffMember;
  draft: ProfileDraft;
  given: string;
  companySignature: string;
  preview: string;
  phoneMismatch: { found: string; file: string } | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (patch: Partial<ProfileDraft>) => void;
  onInsert: (token: string) => void;
  onUsePhoneToken: () => void;
}) {
  const custom = Boolean(draft.signature.trim());
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500">EMAIL SIGNATURE</p>
        <div className="flex rounded-lg bg-[#f3f1ee] p-0.5">
          <button
            type="button"
            className={cn("rounded-md px-3 py-1 text-sm", !custom ? "bg-white font-medium shadow-sm" : "text-neutral-500")}
            onClick={() => {
              if (custom) onChange({ signature: "" });
            }}
          >
            Company
          </button>
          <button
            type="button"
            className={cn("rounded-md px-3 py-1 text-sm", custom ? "bg-white font-medium shadow-sm" : "text-neutral-500")}
            onClick={() => {
              if (custom) return;
              onChange({
                signature: companySignature.trim() || `Best,\n{name}\n{title}\n{phone}\n{email}`,
              });
            }}
          >
            Custom
          </button>
        </div>
      </div>
      {custom ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-neutral-500">Insert</span>
            {(["name", "title", "phone", "email"] as const).map((token) => (
              <button
                key={token}
                type="button"
                className="rounded-md border bg-white px-2 py-0.5 text-xs text-neutral-700"
                onClick={() => onInsert(token)}
              >
                {`{${token}}`}
              </button>
            ))}
          </div>
          <Textarea
            ref={textareaRef}
            id="profile-signature"
            rows={5}
            value={draft.signature}
            className="field-sizing-fixed min-h-28 resize-y rounded-xl"
            onChange={(event) => onChange({ signature: event.target.value })}
          />
        </>
      ) : (
        <p className="rounded-xl bg-[#f6f4f1] px-3 py-2 text-sm text-neutral-600">Company signature, filled in for {given}</p>
      )}
      <div className="rounded-xl bg-[#f6f4f1] p-3">
        <p className="text-xs text-neutral-500">Preview</p>
        <div className="mt-2 flex gap-3 rounded-xl bg-white p-3">
          <ProfileAvatar
            member={{ ...member, name: draft.name || member.name }}
            dashed={!member.photoUrl?.trim() && inviteIsPending(member) && !inviteIsExpired(member)}
          />
          <p className="whitespace-pre-wrap text-sm">{preview.trim() || "No company signature yet."}</p>
        </div>
      </div>
      {custom && phoneMismatch ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>
            {phoneMismatch.found} isn’t {possessive(given)} number on file
            {phoneMismatch.file ? `, ${phoneMismatch.file}` : ""}.
          </p>
          <button type="button" className="mt-1 font-semibold underline" onClick={onUsePhoneToken}>
            Use {"{phone}"} instead
          </button>
        </div>
      ) : null}
      <p className="text-sm text-neutral-500">
        {custom ? (
          `Shows under every email sent from the CRM as ${given}.`
        ) : (
          <>
            Edit the company signature in{" "}
            <Link href="/settings#company-email-signature" className="font-medium text-primary hover:underline">
              Company profile
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}

function ChatTab({
  snippet,
  copied,
  liveAt,
  site,
  locked,
  onCopy,
}: {
  snippet: string;
  copied: boolean;
  liveAt: string | null;
  site: string;
  locked: boolean;
  onCopy: () => void;
}) {
  const live = Boolean(liveAt);
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500">WEBSITE CHAT</p>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            live ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500",
          )}
        >
          <span className={cn("size-1.5 rounded-full", live ? "bg-emerald-500" : "bg-neutral-400")} />
          {live ? "Live" : "Not seen yet"}
        </span>
      </div>
      <p className="text-sm text-neutral-600">
        For a site they run. New chats open a lead in their pipeline and notify only them.
        {locked ? " This seat is locked, so the header will not open leads." : ""}
      </p>
      <div className="overflow-hidden rounded-xl bg-[#1c1917] text-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm">Paste in the site’s header</p>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
              copied ? "bg-emerald-700 text-white" : "border border-white/20 text-white",
            )}
            disabled={!snippet}
            onClick={onCopy}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
        <pre className="overflow-x-auto px-4 pb-4 font-mono text-[12px] leading-relaxed text-white/90">{snippet || "Loading the header code..."}</pre>
      </div>
      <p className="text-sm text-neutral-500">
        {live && liveAt
          ? `Last chat loaded on ${site} · ${chicagoDate(liveAt)}`
          : "The status turns green the first time a visitor loads the chat."}
      </p>
    </div>
  );
}

function FooterStatus({
  pending,
  errorCount,
  dirtyCount,
  savedAt,
}: {
  pending: boolean;
  errorCount: number;
  dirtyCount: number;
  savedAt: number | null;
}) {
  if (pending) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" />
        Saving...
      </p>
    );
  }
  if (errorCount > 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <CircleAlert className="size-4" />
        Fix {errorCount} {errorCount === 1 ? "field" : "fields"} to save
      </p>
    );
  }
  if (dirtyCount > 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
        <CircleAlert className="size-4" />
        {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
      </p>
    );
  }
  if (savedAt) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <Check className="size-4" />
        Saved just now
      </p>
    );
  }
  return null;
}
