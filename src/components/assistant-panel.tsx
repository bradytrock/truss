"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUp,
  ArrowUpRight,
  Calendar,
  Camera,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  History,
  Mail,
  MapPin,
  Maximize2,
  MessageSquare,
  Mic,
  Minimize2,
  Paperclip,
  Plus,
  Receipt,
  Sparkles,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrm } from "@/lib/crm-store";
import { compressReceipt } from "@/lib/job-financials";
import { canViewProjectFinancials, canDeleteJobs } from "@/lib/visibility";
import { isReceiptUpload } from "@/lib/receipt-extract";
import { buildAssistantContext } from "@/lib/assistant/context";
import { ASSISTANT_ASK_LABEL, ASSISTANT_NAME } from "@/lib/product";
import { CASSIO_ASK_EVENT, CASSIO_OPEN_EVENT } from "@/lib/assistant/ask";
import { executeToolCall, shouldConfirmCall, toolMessage, type ExecuteExtras } from "@/lib/assistant/execute";
import { asString } from "@/lib/assistant/files";
import {
  addressChoiceLabel,
  applyAddress,
  argumentFields,
  bookAddressesMatching,
  cassioSubtitle,
  cassioSuggestions,
  confirmAction,
  leadDoneLine,
  leadIntro,
  leadNextSteps,
  leadPreview,
  mergeAddressChoices,
  plannedLeadLine,
  preferredAddressId,
  streetHeadline,
  type LeadNextStep,
  type PreviewField,
} from "@/lib/assistant/preview";
import { toolStatus } from "@/lib/assistant/tools";
import type { AssistantMessage, AssistantResponse, AssistantToolCall, AssistantToolResult } from "@/lib/assistant/types";
import type { SuggestedAddress } from "@/lib/address-suggest";
import { LEAD_SOURCES } from "@/lib/lead-sources";
import { leadSourceLabel } from "@/lib/leads";
import { cn } from "@/lib/utils";

const MAX_HOPS = 8;
const THREAD_KEY = "cassio.threads.v1";

const STARTERS = [
  { id: "lead", label: "Lead", seed: "Log a lead for ", icon: UserRound },
  { id: "estimate", label: "Estimate", seed: "Draft an estimate from the price book for ", icon: FileText },
  { id: "invoice", label: "Invoice", seed: "Create an invoice for ", icon: Receipt },
  { id: "expense", label: "Expense", seed: "Log an expense for ", icon: CreditCard },
  { id: "photos", label: "Photos", seed: "Add a photo to ", icon: Camera },
  { id: "calendar", label: "Calendar", seed: "Schedule ", icon: Calendar },
  { id: "mail", label: "Mail", seed: "Review my inbox and ", icon: Mail },
  { id: "pipeline", label: "Pipeline", seed: "What's open in the pipeline for ", icon: ChartNoAxesCombined },
] as const;

const LEAD_INPUTS = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["street", "Street"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "ZIP"],
  ["notes", "Damage notes"],
] as const;

type Attachment = { dataUrl: string; name: string };
type LinkedRecord = { kind: "job" | "contact"; id: string; label: string };

type PendingConfirm = {
  history: AssistantMessage[];
  calls: AssistantToolCall[];
  results: Array<AssistantToolResult | undefined>;
  confirmIndexes: number[];
};

type Receipt = {
  id: string;
  toolCallId: string;
  anchor: number;
  kind: "lead" | "action";
  title: string;
  detail: string;
  planned?: string;
  done?: string;
  href?: string;
  openLabel: string;
  jobId?: string;
  code?: string;
  fullName?: string;
  steps: LeadNextStep[];
  undone: boolean;
};

type SavedThread = { id: string; title: string; at: number; messages: AssistantMessage[] };

type Dictation = {
  lang: string;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
};

function visibleMessages(messages: AssistantMessage[]) {
  return messages.filter((message) => {
    if (message.role === "user") return true;
    return message.role === "assistant" && Boolean(message.content?.trim());
  });
}

function displayMessages(messages: AssistantMessage[], hiddenToolIds: Set<string>) {
  return visibleMessages(messages).filter((message) => {
    if (message.role !== "assistant" || !message.toolCalls?.length) return true;
    return !message.toolCalls.some((call) => hiddenToolIds.has(call.id));
  });
}

function displayUserText(content: string) {
  return content.replace(/\n\n\[(?:Linked [^\]]+|File attached:[^\]]+)\]/g, "").trim();
}

function mentionQuery(value: string) {
  const match = value.match(/(?:^|\s)@([^\n@]*)$/);
  return match ? match[1] : null;
}

function readThreads(): SavedThread[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(THREAD_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is SavedThread => Boolean(row && typeof row === "object" && "messages" in row));
  } catch {
    return [];
  }
}

function CassioMark({ size = "md" }: { size?: "md" | "sm" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-neutral-950 font-semibold text-white",
        size === "md" ? "size-10 rounded-[10px] text-base" : "mt-0.5 size-6 rounded-md text-[11px]",
      )}
      aria-hidden
    >
      C
    </span>
  );
}

function FieldRows({ fields }: { fields: PreviewField[] }) {
  return (
    <dl className="mt-2 divide-y divide-[#efece7] border-t border-[#efece7] dark:divide-border dark:border-border">
      {fields.map((field) =>
        field.label === "Message" || field.value.length > 90 ? (
          <div key={field.label} className="py-2">
            <dt className="text-xs text-[#8a8680]">{field.label}</dt>
            <dd className="mt-1 text-sm whitespace-pre-wrap">{field.value}</dd>
          </div>
        ) : (
          <div key={field.label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
            <dt className="shrink-0 text-[#8a8680]">{field.label}</dt>
            <dd className="text-right">{field.value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

export function AssistantPanel({ className }: { className?: string } = {}) {
  const crm = useCrm();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<SavedThread[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [link, setLink] = useState<LinkedRecord | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [editing, setEditing] = useState(false);
  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hops = useRef(0);
  const busyRef = useRef(false);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const [remoteAddresses, setRemoteAddresses] = useState<{ street: string; rows: SuggestedAddress[] }>({ street: "", rows: [] });
  function markBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
  }

  const extras = useCallback((): ExecuteExtras => ({ attachment }), [attachment]);

  const context = useCallback(() => {
    return buildAssistantContext({
      companyName: crm.company.name || crm.user.company,
      seatName: crm.effectiveStaff?.name || crm.user.name,
      seatRole: crm.effectiveStaff?.role || crm.viewer?.role || crm.user.role,
      path: pathname,
      hasAttachment: Boolean(attachment),
      jobs: crm.jobs,
      contacts: crm.contacts,
      estimates: crm.estimates,
      invoices: canViewProjectFinancials(crm.effectiveStaff?.role ?? crm.viewer?.role) ? crm.invoices : [],
    });
  }, [attachment, crm, pathname]);

  const ownerName = crm.effectiveStaff?.name || crm.user.name || "You";
  const codes = useMemo(
    () => [...crm.jobs, ...crm.opportunities].map((record) => record.code).filter(Boolean),
    [crm.jobs, crm.opportunities],
  );
  const suggestions = useMemo(
    () => cassioSuggestions(crm.jobs.map((job) => ({ code: job.code, name: job.name, deletedAt: job.deletedAt, status: job.status }))),
    [crm.jobs],
  );

  const leadCall = pending?.calls.find((call, index) => pending.confirmIndexes.includes(index) && call.name === "create_lead");
  const leadStreet = leadCall ? asString(leadCall.arguments.street) : "";
  const leadState = leadCall ? asString(leadCall.arguments.state) : "";
  const leadCity = leadCall ? asString(leadCall.arguments.city) : "";
  const leadZip = leadCall ? asString(leadCall.arguments.postalCode) : "";
  const confirmingLead = Boolean(leadCall);
  const bookAddresses = leadStreet.trim().length >= 4 ? bookAddressesMatching(crm.jobs, leadStreet) : [];
  const addresses = mergeAddressChoices(
    bookAddresses,
    remoteAddresses.street === leadStreet ? remoteAddresses.rows : [],
  );
  const selectedAddressId =
    pickedAddressId && addresses.some((row) => row.id === pickedAddressId)
      ? pickedAddressId
      : preferredAddressId(addresses, { street: leadStreet, city: leadCity, postalCode: leadZip });

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/assistant")
      .then(async (response) => {
        const body = (await response.json()) as { configured?: boolean };
        if (!cancelled) setConfigured(Boolean(body.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const scrolled = useRef(false);
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    if (!scrolled.current) {
      scrolled.current = true;
      if (!pending) return;
    }
    if (messages.length === 0 && !pending && receipts.length === 0) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, pending, receipts.length, status, error]);

  useEffect(() => {
    if (!confirmingLead || editing || leadStreet.trim().length < 4) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: leadStreet.trim() });
      if (leadState.trim()) params.set("state", leadState.trim());
      void fetch(`/api/addresses/suggest?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return { suggestions: [] as SuggestedAddress[] };
          return (await response.json()) as { suggestions?: SuggestedAddress[] };
        })
        .then((body) => {
          if (controller.signal.aborted) return;
          setRemoteAddresses({ street: leadStreet, rows: body.suggestions ?? [] });
        })
        .catch((fetchError: unknown) => {
          if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
          setRemoteAddresses({ street: leadStreet, rows: [] });
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [confirmingLead, editing, leadState, leadStreet]);

  function resolvedCalls(current: PendingConfirm) {
    return current.calls.map((call) => {
      if (call.name !== "create_lead" || editing) return call;
      const picked = addresses.find((row) => row.id === selectedAddressId);
      if (!picked) return call;
      const city = asString(call.arguments.city);
      const zip = asString(call.arguments.postalCode);
      if (addresses.length < 2 && city && zip) return call;
      return applyAddress(call, picked);
    });
  }

  async function runLoop(history: AssistantMessage[], startHop = 0) {
    markBusy(true);
    setError(null);
    hops.current = startHop;
    try {
      let current = history;
      while (hops.current < MAX_HOPS) {
        setStatus("Thinking…");
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: current, context: context() }),
        });
        const data = (await response.json()) as AssistantResponse;
        if (!data.ok) {
          setError(data.message);
          return;
        }
        current = [...current, data.message];
        setMessages(current);
        const calls = data.message.toolCalls ?? [];
        if (!calls.length) {
          hops.current = 0;
          return;
        }
        const nextExtras = extras();
        const results: Array<AssistantToolResult | undefined> = Array.from({ length: calls.length });
        const confirmIndexes: number[] = [];
        for (let index = 0; index < calls.length; index += 1) {
          const call = calls[index];
          if (shouldConfirmCall(call, nextExtras)) {
            confirmIndexes.push(index);
            continue;
          }
          setStatus(toolStatus(call.name));
          const result = await executeToolCall(crm, call, nextExtras);
          results[index] = result;
          if (result.href && call.name !== "create_lead") router.push(result.href);
          if (result.ok && (call.name === "log_expense" || call.name === "log_payment" || call.name === "add_job_photo")) {
            setAttachment(null);
          }
        }
        if (confirmIndexes.length) {
          setEditing(false);
          setPending({ history: current, calls, results, confirmIndexes });
          return;
        }
        const toolMessages = calls.map((call, index) => toolMessage(call, results[index] ?? { ok: false, error: "Did not run." }));
        current = [...current, ...toolMessages];
        setMessages(current);
        hops.current += 1;
      }
      setError("Stopped after too many steps. Ask again with a shorter request.");
    } catch (loopError) {
      setError(loopError instanceof Error ? loopError.message : "Cassio couldn't finish that.");
    } finally {
      markBusy(false);
      setStatus("");
    }
  }

  function rememberReceipts(next: AssistantMessage[], made: Receipt[]) {
    if (!made.length) return;
    const anchor = displayMessages(
      next,
      new Set([...receipts.map((receipt) => receipt.toolCallId), ...made.map((receipt) => receipt.toolCallId)]),
    ).length;
    setReceipts((prev) => [...prev, ...made.map((receipt) => ({ ...receipt, anchor }))]);
  }

  function receiptFor(call: AssistantToolCall, result: AssistantToolResult): Receipt | null {
    if (!result.ok) return null;
    if (call.name === "create_lead") {
      const data = (result.data ?? {}) as { code?: string; jobId?: string };
      const preview = leadPreview(call, { ownerName, codes, contacts: crm.contacts });
      const address = preview.addressLine;
      const code = data.code || preview.jobCode;
      const chose = addresses.length > 1;
      return {
        id: call.id,
        toolCallId: call.id,
        anchor: 0,
        kind: "lead",
        title: `Lead created · ${code}`,
        detail: [preview.fullName, address, preview.damage].filter(Boolean).join(" · "),
        planned: plannedLeadLine(address, chose),
        done: leadDoneLine(preview.firstName),
        href: result.href,
        openLabel: "Open job",
        jobId: data.jobId,
        code,
        fullName: preview.fullName,
        steps: leadNextSteps({ firstName: preview.firstName, address, code }),
        undone: false,
      };
    }
    const action = confirmAction(call.name);
    const fields = argumentFields(call);
    return {
      id: call.id,
      toolCallId: call.id,
      anchor: 0,
      kind: "action",
      title: result.label || action.action,
      detail: fields.map((field) => `${field.label}: ${field.value}`).join(" · "),
      href: result.href,
      openLabel: "Open",
      steps: [],
      undone: false,
    };
  }

  async function finishPending(approved: boolean) {
    if (!pending || busyRef.current) return;
    const current = pending;
    markBusy(true);
    setError(null);
    try {
    const calls = resolvedCalls(current);
    const results = [...current.results];
    const made: Receipt[] = [];
    for (const index of current.confirmIndexes) {
      const call = calls[index];
      if (!approved) {
        results[index] = { ok: false, error: "The user declined." };
        continue;
      }
      setStatus(toolStatus(call.name));
      const result = await executeToolCall(crm, call, extras());
      results[index] = result;
      if (result.href && call.name !== "create_lead") router.push(result.href);
      if (!result.ok) {
        setError(result.error || "That did not save.");
        continue;
      }
      const receipt = receiptFor(call, result);
      if (receipt) made.push(receipt);
      if (call.name === "create_lead" && receipt?.code) {
        setLink({ kind: "job", id: receipt.jobId || receipt.code, label: receipt.code });
      }
    }
    const toolMessages = calls.map((call, index) => toolMessage(call, results[index] ?? { ok: false, error: "Did not run." }));
    const next = [...current.history, ...toolMessages];
    setPending(null);
    setEditing(false);
    setMessages(next);
    rememberReceipts(next, made);
    hops.current += 1;
    await runLoop(next, hops.current);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That did not save.");
      markBusy(false);
    }
  }

  function composeUser(content: string) {
    const notes = [
      attachment ? `[File attached: ${attachment.name}]` : "",
      link ? `[Linked ${link.kind}: ${link.label}]` : "",
    ].filter(Boolean);
    return notes.length ? `${content}\n\n${notes.join("\n")}` : content;
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busyRef.current) return;
    if (configured === false) {
      setError(`${ASSISTANT_ASK_LABEL} needs OPENAI_API_KEY on the server.`);
      return;
    }
    if (pending) {
      const current = pending;
      markBusy(true);
      const calls = resolvedCalls(current);
      const results = [...current.results];
      for (const index of current.confirmIndexes) {
        results[index] = { ok: false, error: "The user changed the request before saving." };
      }
      const toolMessages = calls.map((call, index) => toolMessage(call, results[index] ?? { ok: false, error: "Did not run." }));
      const next: AssistantMessage[] = [...current.history, ...toolMessages, { role: "user", content: composeUser(content) }];
      setPending(null);
      setEditing(false);
      setMessages(next);
      setInput("");
      setHistoryOpen(false);
      hops.current += 1;
      await runLoop(next, hops.current);
      return;
    }
    markBusy(true);
    const history: AssistantMessage[] = [...messages, { role: "user", content: composeUser(content) }];
    setMessages(history);
    setInput("");
    setHistoryOpen(false);
    hops.current = 0;
    await runLoop(history, 0);
  }

  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    function onAsk(event: Event) {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt?.trim();
      if (!prompt) return;
      setOpen(true);
      void sendRef.current(prompt);
    }
    function onOpen() {
      setOpen(true);
      window.setTimeout(() => composerRef.current?.focus(), 60);
    }
    window.addEventListener(CASSIO_ASK_EVENT, onAsk);
    window.addEventListener(CASSIO_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(CASSIO_ASK_EVENT, onAsk);
      window.removeEventListener(CASSIO_OPEN_EVENT, onOpen);
    };
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function onComposerKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  async function attachFile(file: File) {
    if (!isReceiptUpload(file)) {
      toast.error("Attach a photo or PDF (receipt, check, or job picture).");
      return;
    }
    try {
      const compressed = await compressReceipt(file);
      setAttachment({ dataUrl: compressed.dataUrl, name: compressed.file.name });
    } catch (attachError) {
      toast.error(attachError instanceof Error ? attachError.message : "Could not open that photo.");
    }
  }

  function patchCall(callId: string, patch: Record<string, string>) {
    setPending((current) => {
      if (!current) return current;
      return {
        ...current,
        calls: current.calls.map((call) =>
          call.id === callId ? { ...call, arguments: { ...call.arguments, ...patch } } : call,
        ),
      };
    });
  }

  function beginEdit(call: AssistantToolCall) {
    if (call.name === "create_lead") {
      const picked = addresses.find((row) => row.id === selectedAddressId);
      if (picked) patchCall(call.id, { street: picked.street, city: picked.city, state: picked.state, postalCode: picked.postalCode });
    }
    setEditing(true);
  }

  function startNewChat() {
    if (busy || pending) return;
    if (messages.length) {
      const title = displayUserText(messages.find((message) => message.role === "user")?.content ?? "Chat").slice(0, 80);
      const next = [{ id: crypto.randomUUID(), title: title || "Chat", at: Date.now(), messages }, ...threads].slice(0, 12);
      setThreads(next);
      try {
        sessionStorage.setItem(THREAD_KEY, JSON.stringify(next));
      } catch {
        /* session history is optional */
      }
    }
    setMessages([]);
    setReceipts([]);
    setPending(null);
    setError(null);
    setLink(null);
    setInput("");
    setHistoryOpen(false);
    setEditing(false);
  }

  async function undoReceipt(receipt: Receipt) {
    if (!receipt.jobId || receipt.undone || busyRef.current) return;
    markBusy(true);
    try {
      if (canDeleteJobs(crm.viewer)) {
        const ok = await crm.deleteJob(receipt.jobId, "Undone in Cassio");
        if (!ok) return;
        setReceipts((current) =>
          current.map((item) =>
            item.id === receipt.id ? { ...item, undone: true, title: `Lead undone · ${item.code ?? ""}`.trim(), steps: [], done: undefined } : item,
          ),
        );
        return;
      }
      await crm.moveWork(receipt.jobId, "lost");
      setReceipts((current) =>
        current.map((item) =>
          item.id === receipt.id
            ? { ...item, undone: true, title: `Lead moved to Lost · ${item.code ?? ""}`.trim(), steps: [], done: undefined }
            : item,
        ),
      );
      toast.message("Moved that lead to Lost.");
    } finally {
      markBusy(false);
    }
  }

  function dictate() {
    const host = window as Window & {
      SpeechRecognition?: new () => Dictation;
      webkitSpeechRecognition?: new () => Dictation;
    };
    const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("This browser can't take dictation.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
      if (!text) return;
      setInput((value) => (value.trim() ? `${value.trim()} ${text}` : text));
    };
    recognition.onerror = () => toast.error("Didn't catch that.");
    recognition.start();
  }

  function chooseLink(next: LinkedRecord) {
    setLink(next);
    setMentionOpen(false);
    setInput((value) => value.replace(/(?:^|\s)@[^\n@]*$/, "").trimEnd());
    composerRef.current?.focus();
  }

  const query = mentionQuery(input);
  const pickerOpen = mentionOpen || query !== null;
  const needle = (query ?? "").trim().toLowerCase();
  const jobChoices = crm.jobs
    .filter((job) => !job.deletedAt)
    .filter((job) => !needle || `${job.code} ${job.name} ${job.location}`.toLowerCase().includes(needle))
    .slice(0, 6);
  const contactChoices = crm.contacts
    .filter((contact) => !needle || `${contact.name} ${contact.phone}`.toLowerCase().includes(needle))
    .slice(0, 6);

  const covered = new Set([
    ...receipts.map((receipt) => receipt.toolCallId),
    ...(pending?.calls.filter((_, index) => pending.confirmIndexes.includes(index)).map((call) => call.id) ?? []),
  ]);
  const shown = displayMessages(messages, covered);
  const activeLead = receipts.findLast((receipt) => receipt.kind === "lead" && !receipt.undone);
  const subtitleName = leadCall
    ? `${asString(leadCall.arguments.firstName)} ${asString(leadCall.arguments.lastName)}`.trim()
    : activeLead?.fullName;
  const empty = shown.length === 0 && !pending && receipts.length === 0;
  const placeholder = pending
    ? "Reply, or tell Cassio what to change..."
    : receipts.length
      ? "Tell Cassio what's next..."
      : "Tell Cassio what to do...";
  const canSend = Boolean(input.trim()) && !busy && configured !== false;

  function seedComposer(seed: string) {
    setInput(seed);
    setHistoryOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={cn(
          "border-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label={ASSISTANT_ASK_LABEL}
        title={`${ASSISTANT_ASK_LABEL} (⌘.)`}
      >
        <Sparkles data-icon="inline-start" />
        <span className="hidden sm:inline">{ASSISTANT_ASK_LABEL}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-[#141414]/55"
          data-testid="cassio-popup"
          className={cn(
            "top-auto right-4 bottom-4 left-auto flex h-[min(56rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),26.75rem)] max-w-none origin-bottom-right translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[1.35rem] border-0 bg-[#f7f6f3] p-0 text-[#1c1b19] shadow-[0_24px_80px_rgba(0,0,0,0.28)] ring-0 sm:max-w-none data-open:slide-in-from-bottom-8 data-open:slide-in-from-right-4 data-closed:slide-out-to-bottom-8 data-closed:slide-out-to-right-4 dark:bg-popover dark:text-popover-foreground",
            expanded && "w-[min(calc(100%-2rem),42rem)]",
          )}
        >
          <header className="flex items-start gap-3 px-4 pt-4 pb-2">
            <CassioMark />
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="font-sans text-[15px] font-semibold tracking-tight text-inherit">Cassio</DialogTitle>
              <DialogDescription className="text-[13px] text-[#6f6b66] dark:text-muted-foreground">
                {cassioSubtitle(subtitleName)}
              </DialogDescription>
            </div>
            <div className="flex items-center text-[#6d6964]">
              {messages.length > 0 ? (
                <IconButton label="New chat" onClick={startNewChat} disabled={busy || Boolean(pending)}>
                  <Plus className="size-4" />
                </IconButton>
              ) : (
                <IconButton label={expanded ? "Shrink Cassio" : "Expand Cassio"} pressed={expanded} onClick={() => setExpanded((value) => !value)}>
                  {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </IconButton>
              )}
              <IconButton
                label="Earlier chats"
                pressed={historyOpen}
                onClick={() => {
                  setThreads(readThreads());
                  setHistoryOpen((value) => !value);
                }}
              >
                <History className="size-4" />
              </IconButton>
              <IconButton label="Close" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </IconButton>
            </div>
          </header>

          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            {historyOpen ? (
              <HistoryList
                threads={threads}
                onOpen={(thread) => {
                  setMessages(thread.messages);
                  setReceipts([]);
                  setPending(null);
                  setHistoryOpen(false);
                }}
              />
            ) : empty ? (
              <>
                {configured === false ? (
                  <p className="mb-4 text-sm text-[#6f6b66]">
                    {ASSISTANT_ASK_LABEL} needs <code className="font-mono text-xs">OPENAI_API_KEY</code> in{" "}
                    <code className="font-mono text-xs">.env.local</code> before it can save anything.
                  </p>
                ) : null}
                <EmptyState
                  suggestions={suggestions}
                  onSeed={seedComposer}
                  onSuggest={(prompt) => void send(prompt)}
                  disabled={busy || configured === false}
                />
              </>
            ) : (
              <div className="space-y-3" data-testid="cassio-thread">
                {shown.map((message, index) => (
                  <div key={`${message.role}-${index}`}>
                    <MessageBubble message={message} />
                    {receipts
                      .filter((receipt) => receipt.anchor === index + 1)
                      .map((receipt) => (
                        <ReceiptBlock
                          key={receipt.id}
                          receipt={receipt}
                          busy={busy}
                          onOpen={() => {
                            if (receipt.href) router.push(receipt.href);
                          }}
                          onUndo={() => void undoReceipt(receipt)}
                          onStep={(prompt) => void send(prompt)}
                        />
                      ))}
                  </div>
                ))}
                {pending?.confirmIndexes.map((index) => {
                  const call = pending.calls[index];
                  if (!call) return null;
                  if (call.name === "create_lead") {
                    const preview = leadPreview(call, { ownerName, codes, contacts: crm.contacts });
                    return (
                      <LeadConfirm
                        key={call.id}
                        preview={preview}
                        call={call}
                        editing={editing}
                        addresses={addresses}
                        pickedId={selectedAddressId}
                        busy={busy}
                        onPick={setPickedAddressId}
                        onEdit={() => (editing ? setEditing(false) : beginEdit(call))}
                        onPatch={(patch) => patchCall(call.id, patch)}
                        onSave={() => void finishPending(true)}
                        onCancel={() => void finishPending(false)}
                      />
                    );
                  }
                  return (
                    <ActionConfirm
                      key={call.id}
                      call={call}
                      editing={editing}
                      busy={busy}
                      onEdit={() => setEditing((value) => !value)}
                      onPatch={(patch) => patchCall(call.id, patch)}
                      onSave={() => void finishPending(true)}
                      onCancel={() => void finishPending(false)}
                    />
                  );
                })}
                {status && busy ? <p className="text-xs text-[#8a8680]">{status}</p> : null}
                {error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <p>{error}</p>
                    <button type="button" className="mt-1 text-xs underline" onClick={() => setError(null)}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="px-4 pt-1 pb-3">
            <div className="rounded-2xl border border-[#e4e1db] bg-white px-3 pt-3 pb-2 shadow-[0_1px_0_rgba(0,0,0,0.02)] dark:border-border dark:bg-background">
              {attachment ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#efece7] px-2 py-1.5">
                  {attachment.dataUrl.startsWith("data:application/pdf") ? (
                    <span className="flex size-8 items-center justify-center rounded-md bg-[#f3f1ed] text-[10px] font-medium">PDF</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.dataUrl} alt="" className="size-8 rounded-md object-cover" />
                  )}
                  <p className="min-w-0 flex-1 truncate text-xs">{attachment.name}</p>
                  <button type="button" className="grid size-6 place-items-center" onClick={() => setAttachment(null)} aria-label="Remove photo">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : null}
              <textarea
                ref={composerRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onComposerKey}
                aria-label={placeholder}
                placeholder={placeholder}
                rows={2}
                disabled={busy || configured === false}
                className="max-h-28 w-full resize-none bg-transparent text-sm outline-none placeholder:text-[#a39e97] disabled:opacity-60"
              />
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void attachFile(file);
                  }}
                />
                <IconButton label="Attach photo" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Paperclip className="size-4" />
                </IconButton>
                {link ? (
                  <button
                    type="button"
                    className="inline-flex h-7 max-w-[11rem] items-center gap-1 rounded-full bg-[#f8e4e1] px-2.5 text-xs font-medium text-primary"
                    onClick={() => setLink(null)}
                    aria-label={`Remove linked ${link.kind} ${link.label}`}
                  >
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-full bg-[#eceae6] px-2.5 text-xs text-[#5e5a55] dark:bg-muted dark:text-muted-foreground"
                    onClick={() => setMentionOpen((value) => !value)}
                  >
                    @ Job or contact
                  </button>
                )}
                <span className="flex-1" />
                <IconButton label="Dictate" onClick={dictate} disabled={busy}>
                  <Mic className="size-4" />
                </IconButton>
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!canSend}
                  className={cn(
                    "grid size-9 place-items-center rounded-[10px] transition-colors",
                    canSend ? "bg-primary text-white" : "bg-[#e6e3de] text-[#a7a29c]",
                  )}
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
              {pickerOpen ? (
                <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-[#e4e1db] bg-[#fafaf8] p-1 dark:border-border dark:bg-popover">
                  {jobChoices.length === 0 && contactChoices.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-[#8a8680]">Nothing in the book matches.</p>
                  ) : null}
                  {jobChoices.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white"
                      onClick={() => chooseLink({ kind: "job", id: job.id, label: job.code || job.name })}
                    >
                      <span className="truncate">{job.name}</span>
                      <span className="shrink-0 text-xs text-[#8a8680]">{job.code}</span>
                    </button>
                  ))}
                  {contactChoices.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white"
                      onClick={() => chooseLink({ kind: "contact", id: contact.id, label: contact.name })}
                    >
                      <span className="truncate">{contact.name}</span>
                      <span className="shrink-0 text-xs text-[#8a8680]">Contact</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-[#8d8983]">
              <span><span className="font-medium text-[#5e5a55]">⌘.</span> open</span>
              <span><span className="font-medium text-[#5e5a55]">Enter</span> send</span>
              <span><span className="font-medium text-[#5e5a55]">Shift+Enter</span> new line</span>
              <span><span className="font-medium text-[#5e5a55]">@</span> link a job</span>
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-[#6d6964] hover:bg-black/5 disabled:opacity-40 dark:text-muted-foreground dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function EmptyState({
  suggestions,
  onSeed,
  onSuggest,
  disabled,
}: {
  suggestions: ReturnType<typeof cassioSuggestions>;
  onSeed: (seed: string) => void;
  onSuggest: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div data-testid="cassio-empty">
      <h2 className="font-heading text-[1.7rem] leading-[1.15] font-medium tracking-tight text-[#1c1b19] dark:text-foreground">
        What should we get done?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#6f6b66] dark:text-muted-foreground">
        Say it the way you&apos;d tell the office. {ASSISTANT_NAME} shows you what it&apos;ll change before anything is saved.
      </p>
      <p className="mt-5 text-[11px] font-medium tracking-[0.14em] text-[#8a8680]">START WITH</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {STARTERS.map((starter) => {
          const Icon = starter.icon;
          return (
            <button
              key={starter.id}
              type="button"
              className="flex aspect-[1.05] flex-col items-center justify-center gap-1.5 rounded-xl border border-[#e4e1db] bg-white text-[13px] font-medium text-[#1c1b19] hover:border-[#d0ccc4] dark:border-border dark:bg-background dark:text-foreground"
              onClick={() => onSeed(starter.seed)}
            >
              <Icon className="size-5 text-primary" strokeWidth={1.75} />
              {starter.label}
            </button>
          );
        })}
      </div>
      <p className="mt-5 text-[11px] font-medium tracking-[0.14em] text-[#8a8680]">SUGGESTED</p>
      <div className="mt-2 space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.meta + suggestion.title}
            type="button"
            disabled={disabled}
            className="flex w-full items-center gap-3 rounded-xl border border-[#e4e1db] bg-white px-3.5 py-3 text-left hover:border-[#d0ccc4] disabled:opacity-60 dark:border-border dark:bg-background"
            onClick={() => onSuggest(suggestion.prompt)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug">{suggestion.title}</span>
              <span className="mt-1 block text-xs text-[#8a8680]">{suggestion.meta}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#b0aaa3]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[88%] rounded-2xl bg-[#161616] px-3.5 py-2.5 text-sm leading-snug whitespace-pre-wrap text-white">
          {displayUserText(message.content)}
        </p>
      </div>
    );
  }
  if (message.role !== "assistant") return null;
  return (
    <div className="flex items-start gap-2.5">
      <CassioMark size="sm" />
      <p className="pt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}

function LeadConfirm({
  preview,
  call,
  editing,
  addresses,
  pickedId,
  busy,
  onPick,
  onEdit,
  onPatch,
  onSave,
  onCancel,
}: {
  preview: ReturnType<typeof leadPreview>;
  call: AssistantToolCall;
  editing: boolean;
  addresses: SuggestedAddress[];
  pickedId: string | null;
  busy: boolean;
  onPick: (id: string) => void;
  onEdit: () => void;
  onPatch: (patch: Record<string, string>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const choosing = !editing && addresses.length > 1;
  const picked = addresses.find((row) => row.id === pickedId);
  const fields = [...preview.fields];
  if (!choosing && preview.addressLine) {
    const after = fields.findIndex((field) => field.label === "Phone" || field.label === "Email");
    fields.splice(after >= 0 ? after + 1 : 1, 0, { label: "Address", value: picked ? addressChoiceLabel(picked) : preview.addressLine });
  }
  return (
    <div className="space-y-3" data-testid="cassio-confirm">
      <div className="flex items-start gap-2.5">
        <CassioMark size="sm" />
        <p className="pt-0.5 text-sm leading-relaxed">{leadIntro(addresses.length, preview.street)}</p>
      </div>
      <div className="rounded-2xl border border-[#e7e4de] bg-white p-3.5 dark:border-border dark:bg-background">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-[#f8e4e1] text-primary">
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">New lead</p>
            <p className="text-xs text-[#8a8680]">Job code {preview.jobCode}</p>
          </div>
          <span className="rounded-full bg-[#f6e7c3] px-2 py-0.5 text-[11px] font-medium text-[#8a5a16]">Not saved</span>
        </div>
        {editing ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {LEAD_INPUTS.map(([key, label]) => (
              <label key={key} className={cn("block text-xs text-[#8a8680]", key === "notes" && "col-span-2")}>
                {label}
                <input
                  value={asString(call.arguments[key])}
                  onChange={(event) => onPatch({ [key]: event.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-[#e4e1db] bg-white px-2 text-sm text-[#1c1b19]"
                />
              </label>
            ))}
            <label className="col-span-2 block text-xs text-[#8a8680]">
              Source
              <select
                value={asString(call.arguments.source)}
                onChange={(event) => onPatch({ source: event.target.value })}
                className="mt-1 h-8 w-full rounded-md border border-[#e4e1db] bg-white px-2 text-sm text-[#1c1b19]"
              >
                {LEAD_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {leadSourceLabel(source)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <FieldRows fields={fields} />
        )}
        {choosing ? (
          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-primary">Which {streetHeadline(preview.street)}?</legend>
            <div className="mt-2 space-y-2 rounded-xl border border-[#f0d2cb] bg-[#fdf8f7] p-2">
              {addresses.map((row) => {
                const selected = row.id === pickedId;
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onPick(row.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 text-left text-sm",
                      selected ? "border-primary" : "border-[#eadfdc]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full border",
                        selected ? "border-primary" : "border-[#cfc8c4]",
                      )}
                    >
                      {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                    </span>
                    {addressChoiceLabel(row)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="h-10 rounded-[10px] bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            Create lead
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            className="h-10 rounded-[10px] border border-[#e4e1db] bg-white px-4 text-sm font-medium"
          >
            {editing ? "Show summary" : "Edit fields"}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="h-10 px-2 text-sm text-[#5e5a55]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionConfirm({
  call,
  editing,
  busy,
  onEdit,
  onPatch,
  onSave,
  onCancel,
}: {
  call: AssistantToolCall;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onPatch: (patch: Record<string, string>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const action = confirmAction(call.name);
  const fields = argumentFields(call);
  const editable = Object.entries(call.arguments).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return (
    <div className="rounded-2xl border border-[#e7e4de] bg-white p-3.5 dark:border-border dark:bg-background" data-testid="cassio-confirm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{action.title}</p>
        <span className="rounded-full bg-[#f6e7c3] px-2 py-0.5 text-[11px] font-medium text-[#8a5a16]">Not saved</span>
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          {editable.map(([key, value]) => (
            <label key={key} className="block text-xs text-[#8a8680]">
              {key}
              <input
                value={value}
                onChange={(event) => onPatch({ [key]: event.target.value })}
                className="mt-1 h-8 w-full rounded-md border border-[#e4e1db] bg-white px-2 text-sm text-[#1c1b19]"
              />
            </label>
          ))}
        </div>
      ) : (
        <FieldRows fields={fields} />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={onSave} className="h-10 rounded-[10px] bg-primary px-4 text-sm font-medium text-white disabled:opacity-60">
          {action.action}
        </button>
        <button type="button" disabled={busy} onClick={onEdit} className="h-10 rounded-[10px] border border-[#e4e1db] bg-white px-4 text-sm font-medium">
          {editing ? "Show summary" : "Edit fields"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="h-10 px-2 text-sm text-[#5e5a55]">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReceiptBlock({
  receipt,
  busy,
  onOpen,
  onUndo,
  onStep,
}: {
  receipt: Receipt;
  busy: boolean;
  onOpen: () => void;
  onUndo: () => void;
  onStep: (prompt: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3" data-testid="cassio-done">
      {receipt.planned ? (
        <div className="flex items-start gap-2.5">
          <CassioMark size="sm" />
          <p className="pt-0.5 text-sm leading-relaxed">{receipt.planned}</p>
        </div>
      ) : null}
      <div className="rounded-2xl border border-[#e7e4de] bg-white p-3.5 dark:border-border dark:bg-background">
        <div className="flex items-start gap-2.5">
          <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", receipt.undone ? "bg-[#eceae6] text-[#6d6964]" : "bg-emerald-100 text-emerald-700")}>
            <Check className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{receipt.title}</p>
            {receipt.detail ? <p className="mt-0.5 text-xs leading-relaxed text-[#6f6b66]">{receipt.detail}</p> : null}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {receipt.href ? (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#e4e1db] bg-white px-3 text-sm font-medium"
            >
              {receipt.openLabel}
              <ArrowUpRight className="size-3.5" />
            </button>
          ) : null}
          {receipt.kind === "lead" && !receipt.undone ? (
            <button type="button" disabled={busy} onClick={onUndo} className="inline-flex items-center gap-1.5 text-sm text-[#5e5a55] disabled:opacity-50">
              <Undo2 className="size-3.5" />
              Undo
            </button>
          ) : null}
        </div>
      </div>
      {receipt.done ? <p className="text-sm leading-relaxed">{receipt.done}</p> : null}
      {receipt.steps.length ? (
        <div className="space-y-2">
          {receipt.steps.map((step) => (
            <button
              key={step.id}
              type="button"
              disabled={busy}
              onClick={() => onStep(step.prompt)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-[#e4e1db] bg-white px-3 py-2.5 text-left text-sm hover:bg-[#fafaf8] disabled:opacity-60 dark:border-border dark:bg-background"
            >
              <StepIcon id={step.id} />
              {step.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StepIcon({ id }: { id: LeadNextStep["id"] }) {
  const className = "size-4 shrink-0 text-primary";
  if (id === "inspect") return <Calendar className={className} />;
  if (id === "text") return <MessageSquare className={className} />;
  return <FileText className={className} />;
}

function HistoryList({ threads, onOpen }: { threads: SavedThread[]; onOpen: (thread: SavedThread) => void }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.14em] text-[#8a8680]">EARLIER</p>
      {threads.length === 0 ? (
        <p className="mt-3 text-sm text-[#6f6b66]">Chats from this sitting show up here after you start a new one.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => onOpen(thread)}
                className="w-full rounded-xl border border-[#e4e1db] bg-white px-3.5 py-3 text-left text-sm hover:border-[#d0ccc4]"
              >
                {thread.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
