"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AudioLines,
  Calendar,
  Camera,
  ClipboardCheck,
  Columns3,
  FileText,
  House,
  Mail,
  MessageSquare,
  Mic,
  Pencil,
  Plus,
  UserPlus,
  UserRound,
  CircleDollarSign,
  SquareCheckBig,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  FIELD,
  FIELD_NOTE_EVENT,
  openFieldCreate,
  type FieldNoteDetail,
} from "@/lib/field-chrome";
import { currentFieldSite } from "@/lib/field-home";
import { messagesHref } from "@/lib/job-messages";
import { askCassio } from "@/lib/assistant/ask";
import { ASSISTANT_NAME } from "@/lib/product";
import { useCrm } from "@/lib/crm-store";
import { cn } from "@/lib/utils";

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  start: () => void;
};

export function FieldNav() {
  const pathname = usePathname();
  const router = useRouter();
  const crm = useCrm();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath != null && menuPath === pathname;
  const [note, setNote] = useState<FieldNoteDetail | null>(null);
  const [prompt, setPrompt] = useState("");

  const site = useMemo(
    () =>
      currentFieldSite({
        staffName: crm.effectiveStaff?.name || crm.user.name || "",
        staffId: crm.effectiveStaff?.id || crm.user.staffId || "",
        events: crm.events,
        jobs: crm.jobs,
        opportunities: crm.opportunities,
        contacts: crm.contacts,
        tasks: [],
        payments: [],
        messages: [],
        wonDeals: [],
      }).site,
    [
      crm.contacts,
      crm.effectiveStaff,
      crm.events,
      crm.jobs,
      crm.opportunities,
      crm.user.name,
      crm.user.staffId,
    ],
  );

  useEffect(() => {
    function onNote(event: Event) {
      const detail = (event as CustomEvent<FieldNoteDetail>).detail;
      if (!detail?.entityId) return;
      setMenuPath(null);
      setNote(detail);
    }
    window.addEventListener(FIELD_NOTE_EVENT, onNote);
    return () => window.removeEventListener(FIELD_NOTE_EVENT, onNote);
  }, []);

  useEffect(() => {
    if (!menuOpen && !note) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuPath(null);
        setNote(null);
      }
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, note]);

  function go(href: string) {
    setMenuPath(null);
    router.push(href);
  }

  function createForSite(kind: "estimate" | "invoice" | "task" | "event") {
    setMenuPath(null);
    openFieldCreate({
      kind,
      jobId: site?.jobId,
      opportunityId: site?.opportunityId,
      contactId: site?.contactId,
      clientId: site?.clientId,
    });
  }

  function openNote() {
    if (!site?.entityType || !site.entityId) {
      toast.message("Open a lead or job before adding a note.");
      return;
    }
    setMenuPath(null);
    setNote({ entityType: site.entityType, entityId: site.entityId, label: site.name });
  }

  function submitPrompt(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    setPrompt("");
    setMenuPath(null);
    askCassio(text);
  }

  function listen() {
    const host = window as Window & {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (!Ctor) {
      toast.message("Type it in the field. This browser has no speech recognition.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (result) => {
      const text = result.results[0]?.[0]?.transcript?.trim();
      if (text) setPrompt(text);
    };
    try {
      rec.start();
    } catch {
      toast.message("The microphone did not start.");
    }
  }

  return (
    <>
      {menuOpen ? null : (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#121214]/95 backdrop-blur md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Primary"
        >
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-1 pt-1 pb-1.5">
            <Tab href="/" label="Home" icon={House} active={pathname === "/"} />
            <Tab href="/jobs" label="Pipeline" icon={Columns3} active={pipelineActive(pathname)} />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setMenuPath(pathname)}
                className="mb-0.5 grid size-[3.35rem] -translate-y-3 place-items-center rounded-full text-white shadow-[0_8px_22px_rgba(226,59,50,0.38)]"
                style={{ background: FIELD.red }}
                aria-label="Create"
              >
                <Plus className="size-7" strokeWidth={2.4} />
              </button>
            </div>
            <Tab href="/messages" label="Inbox" icon={Mail} active={inboxActive(pathname)} />
            <Tab href="/calendar" label="Calendar" icon={Calendar} active={pathname.startsWith("/calendar")} />
          </div>
        </nav>
      )}

      {menuOpen ? (
        <FieldPortal>
        <div className="fixed inset-0 z-[80] md:hidden">
          <button type="button" className="absolute inset-0 bg-black/65" aria-label="Close menu" onClick={() => setMenuPath(null)} />
          <div className="absolute inset-x-3 bottom-24 max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-[28px] bg-[#1c1c1f] p-4 shadow-2xl">
            {site ? (
              <p className="flex items-center gap-2 px-1 text-[13px]">
                <span className="size-2 shrink-0 rounded-full" style={{ background: FIELD.green }} />
                <span className="text-white/45">For this site</span>
                <span className="min-w-0 truncate font-medium text-white">
                  {site.name}, {site.street}
                </span>
              </p>
            ) : (
              <p className="px-1 text-[13px] text-white/45">Nothing selected. New records start blank.</p>
            )}

            <div className="mt-3 grid grid-cols-4 gap-2">
              <MenuTile
                label="Inspection"
                icon={ClipboardCheck}
                hot
                onClick={() => go(site ? (site.jobId ? site.photosHref : site.href) : "/photos")}
              />
              <MenuTile
                label="Photos"
                icon={Camera}
                onClick={() => go(site?.jobId ? site.photosHref : "/photos")}
              />
              <MenuTile label="Estimate" icon={FileText} onClick={() => createForSite("estimate")} />
              <MenuTile label="Note" icon={Pencil} onClick={openNote} />
            </div>

            <p className="mt-4 px-1 text-[10px] font-semibold tracking-[0.16em] text-white/40">NEW</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MenuTile label="Lead" icon={UserPlus} onClick={() => { setMenuPath(null); openFieldCreate({ kind: "opportunity" }); }} />
              <MenuTile label="Appointment" icon={Calendar} onClick={() => createForSite("event")} />
              <MenuTile label="Task" icon={SquareCheckBig} onClick={() => createForSite("task")} />
              <MenuTile
                label="Text message"
                icon={MessageSquare}
                onClick={() =>
                  go(messagesHref({ contact: site?.contactId, job: site?.jobId, compose: true }))
                }
              />
              <MenuTile label="Request payment" icon={CircleDollarSign} onClick={() => createForSite("invoice")} />
              <MenuTile label="Contact" icon={UserRound} onClick={() => { setMenuPath(null); openFieldCreate({ kind: "client" }); }} />
            </div>

            <form onSubmit={submitPrompt} className="mt-4 flex items-center gap-2 rounded-full bg-[#111113] px-3 py-2.5">
              <AudioLines className="size-4 shrink-0 text-white/40" />
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={site ? `Re-inspect ${site.name} Thu 2pm` : "Schedule an inspection Thursday at 2"}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                aria-label={`Tell ${ASSISTANT_NAME}`}
                autoComplete="off"
              />
              <button type="button" onClick={listen} aria-label="Speak" className="grid size-8 place-items-center text-white/70">
                <Mic className="size-4" />
              </button>
            </form>
            <p className="mt-2 px-2 text-center text-[12px] leading-snug text-white/40">
              Type or say it — {ASSISTANT_NAME} fills in the form for you to confirm.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuPath(null)}
            className="absolute bottom-6 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-[#2c2c2e] text-white shadow-lg"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            aria-label="Close"
          >
            <X className="size-6" />
          </button>
        </div>
        </FieldPortal>
      ) : null}

      {note ? (
        <FieldPortal>
          <FieldNoteDialog detail={note} onClose={() => setNote(null)} />
        </FieldPortal>
      ) : null}
    </>
  );
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof House;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium",
        active ? "text-[#e23b32]" : "text-[#8e8e93]",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-5" strokeWidth={active ? 2.3 : 1.8} />
      {label}
    </Link>
  );
}

function MenuTile({
  label,
  icon: Icon,
  onClick,
  hot = false,
}: {
  label: string;
  icon: typeof Camera;
  onClick: () => void;
  hot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[4.6rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center text-[11px] leading-tight font-medium",
        hot ? "text-white" : "bg-[#2a2a2e] text-white/85",
      )}
      style={hot ? { background: FIELD.red } : undefined}
    >
      <Icon className="size-[18px]" />
      {label}
    </button>
  );
}

function FieldPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function FieldNoteDialog({ detail, onClose }: { detail: FieldNoteDetail; onClose: () => void }) {
  const crm = useCrm();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || pending) return;
    setPending(true);
    try {
      await crm.addActivity({
        entityType: detail.entityType,
        entityId: detail.entityId,
        type: "note",
        body: text,
      });
      toast.success("Note saved");
      onClose();
    } catch {
      toast.error("Could not save that note.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/65" aria-label="Close note" onClick={onClose} />
      <form
        onSubmit={(event) => void save(event)}
        className="absolute inset-x-3 bottom-24 rounded-[28px] bg-[#1c1c1f] p-4 text-white shadow-2xl"
      >
        <p className="text-[11px] font-semibold tracking-[0.14em] text-white/40">NOTE</p>
        <p className="mt-1 text-base font-semibold">{detail.label}</p>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What did you see on site?"
          rows={4}
          className="mt-3 w-full resize-none rounded-2xl bg-[#111113] px-3 py-3 text-sm outline-none placeholder:text-white/35"
          autoFocus
        />
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: FIELD.red }}
        >
          {pending ? "Saving…" : "Save note"}
        </button>
      </form>
    </div>
  );
}

function pipelineActive(pathname: string) {
  return (
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/opportunities") ||
    pathname.startsWith("/material-orders")
  );
}

function inboxActive(pathname: string) {
  return pathname.startsWith("/messages") || pathname.startsWith("/mail");
}
