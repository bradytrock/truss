"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  FilePlus,
  Home,
  Mail,
  Maximize2,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ContactRecordWindow } from "@/components/contact-window";
import { CreateClientDialog, CreateJobDialog, EditContactDialog } from "@/components/create-records";
import { ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { StartEstimateDialogHost } from "@/components/start-estimate-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  CONTACT_FILTER_OPTIONS,
  CONTACT_STAGE_META,
  avatarTone,
  buildContactBook,
  contactFilterCounts,
  parseContactCsv,
  parseContactFilter,
  visibleContactRows,
  type ContactBookRow,
  type ContactFilter,
} from "@/lib/contact-book";
import { useCrm } from "@/lib/crm-store";
import { formatDateShort, initials, localYmd } from "@/lib/format";
import { mailHref } from "@/lib/job-emails";
import { digitsOnly } from "@/lib/phone";
import { useStartEstimate } from "@/lib/start-estimate";
import { cn } from "@/lib/utils";

export function ContactsDesk() {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const startEstimate = useStartEstimate();

  const filter = parseContactFilter(searchParams.get("filter"));
  const contactId = searchParams.get("contact");

  const rows = useMemo(
    () =>
      buildContactBook({
        contacts: crm.contacts,
        clients: crm.clients,
        jobs: crm.jobs,
        opportunities: crm.opportunities,
        estimates: crm.estimates,
        tasks: crm.tasks,
        activities: crm.activities,
        gmailMessages: crm.gmailMessages,
      }),
    [
      crm.activities,
      crm.clients,
      crm.contacts,
      crm.estimates,
      crm.gmailMessages,
      crm.jobs,
      crm.opportunities,
      crm.tasks,
    ],
  );

  const visible = useMemo(() => visibleContactRows(rows, filter, query), [filter, query, rows]);
  const counts = useMemo(() => contactFilterCounts(rows), [rows]);
  const openContact = contactId ? crm.getContact(contactId) : undefined;
  const selected = openContact ? rows.find((row) => row.id === openContact.id) : undefined;

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `/contacts?${qs}` : "/contacts", { scroll: false });
    },
    [router, searchParams],
  );

  const setFilter = useCallback(
    (next: ContactFilter) => {
      replaceParams((params) => {
        if (next === "all") params.delete("filter");
        else params.set("filter", next);
      });
    },
    [replaceParams],
  );

  const selectContact = useCallback(
    (id: string) => {
      replaceParams((params) => {
        params.set("contact", id);
      });
      setNote("");
      setAddingTask(false);
      setTaskTitle("");
      setFullOpen(false);
    },
    [replaceParams],
  );

  const closeContact = useCallback(() => {
    replaceParams((params) => {
      params.delete("contact");
    });
    setFullOpen(false);
    setEditOpen(false);
    setAddingTask(false);
  }, [replaceParams]);

  const step = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((row) => row.id === contactId);
      const next = visible[Math.min(visible.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
      if (next) {
        selectContact(next.id);
        document.querySelector<HTMLElement>(`[data-contact="${next.id}"]`)?.scrollIntoView({
          block: "nearest",
        });
      }
    },
    [contactId, selectContact, visible],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target?.closest("input, textarea, select, [contenteditable='true']"),
      );
      if (typing) return;
      if (event.key === "/" ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && contactId && !fullOpen && !editOpen) {
        event.preventDefault();
        closeContact();
      }
      if (contactId && !fullOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        step(event.key === "ArrowDown" ? 1 : -1);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeContact, contactId, editOpen, fullOpen, step]);

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const parsed = parseContactCsv(await file.text());
      if (parsed.rows.length === 0) {
        toast.error(parsed.issues[0]?.message || "No contacts in that file.");
        return;
      }
      let added = 0;
      for (const row of parsed.rows) {
        try {
          await crm.addContact({
            clientId: null,
            name: row.name,
            title: row.title,
            email: row.email,
            phone: row.phone,
            ownerStaffId: crm.user.staffId,
            isReferralPartner: false,
            listingWatchUrl: "",
            listingWatchEnabled: false,
          });
          added += 1;
        } catch {
          // Store already toasted.
        }
      }
      if (added) toast.success(`Imported ${added} contact${added === 1 ? "" : "s"}.`);
      if (parsed.issues.length) {
        toast.message(`${parsed.issues.length} row${parsed.issues.length === 1 ? "" : "s"} skipped.`);
      }
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function saveNote() {
    const body = note.trim();
    if (!body || !selected?.noteTarget) {
      if (!selected?.noteTarget) toast.error("Open a job or lead first, then you can hang a note on it.");
      return;
    }
    await crm.addActivity({ ...selected.noteTarget, type: "note", body });
    setNote("");
    toast.success("Note saved");
  }

  async function saveTask() {
    const title = taskTitle.trim() || `Call ${selected?.name ?? "them"} back`;
    if (!selected?.taskTarget) {
      toast.error("Open a job or lead first, then you can hang a callback on it.");
      return;
    }
    try {
      await crm.addTask({
        title,
        dueAt: localYmd(new Date()),
        relatedType: selected.taskTarget.relatedType,
        relatedId: selected.taskTarget.relatedId,
        assignee: crm.effectiveStaff?.name || crm.user.name,
      });
      setTaskTitle("");
      setAddingTask(false);
      toast.success("Task added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the task.");
    }
  }

  if (!crm.hydrated) return <LoadingScreen />;

  const open = Boolean(selected);

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-[2.1rem] leading-none font-semibold tracking-tight text-[#1d1d1f]">
          Contacts
          <span className="ml-2.5 text-[15px] font-normal tracking-normal text-[#6e6e73] tabular-nums">
            {rows.length}
          </span>
        </h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-lg border-[rgba(28,25,22,0.08)] bg-white"
            disabled={importing}
            onClick={() => importRef.current?.click()}
          >
            <Upload data-icon="inline-start" />
            Import
          </Button>
          <Button
            type="button"
            className="rounded-lg bg-[#1d1d1f] text-white hover:bg-black"
            onClick={() => setCreateOpen(true)}
          >
            <Plus data-icon="inline-start" />
            New contact
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border border-[rgba(28,25,22,0.08)] bg-white px-3 max-w-[420px]">
          <Search className="size-4 text-[#a1a1a6]" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, address, phone, or email"
            aria-label="Search contacts"
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div
          role="tablist"
          aria-label="Contact stage"
          className="flex flex-wrap rounded-[10px] bg-[#e9e8e4] p-[3px]"
        >
          {CONTACT_FILTER_OPTIONS.map((item) => {
            const on = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(item.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap",
                  on ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#6e6e73] hover:text-[#1d1d1f]",
                )}
              >
                {item.label}
                <span className="ml-1 font-normal text-[#a1a1a6]">{counts[item.value]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "grid items-start gap-0 transition-[grid-template-columns,gap] duration-300",
          open && "gap-4 md:grid-cols-[minmax(0,1fr)_min(440px,42vw)]",
        )}
      >
        <div
          className={cn(
            "overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(28,25,22,0.08)]",
            open && "max-md:hidden",
          )}
          role="listbox"
          aria-label="Contacts"
        >
          <div
            className={cn(
              "grid h-10 items-center gap-4 border-b border-[rgba(28,25,22,0.08)] px-5 text-xs font-medium text-[#6e6e73]",
              open
                ? "grid-cols-[minmax(0,1fr)_6.875rem]"
                : "grid-cols-[minmax(0,1fr)_6.875rem] xl:grid-cols-[minmax(12.5rem,1.4fr)_minmax(0,1.6fr)_8.125rem_7.5rem_6.875rem]",
            )}
          >
            <span>Name</span>
            <span className={cn("hidden", !open && "xl:inline")}>Address</span>
            <span className={cn("hidden", !open && "xl:inline")}>Phone</span>
            <span className={cn("hidden", !open && "xl:inline")}>Last contact</span>
            <span>Stage</span>
          </div>
          {visible.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[#6e6e73]">
              {query.trim()
                ? `No contacts match “${query.trim()}”.`
                : emptyFilterCopy(filter)}
            </p>
          ) : (
            visible.map((row) => (
              <ContactRow
                key={row.id}
                row={row}
                compact={open}
                selected={row.id === contactId}
                onOpen={() => selectContact(row.id)}
              />
            ))
          )}
        </div>

        <aside
          aria-label="Contact details"
          aria-hidden={!open}
          className={cn(
            "flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(28,25,22,0.08),0_8px_24px_rgba(0,0,0,0.05)]",
            open
              ? "sticky top-4 h-auto md:top-[4.75rem] md:h-[calc(100vh-6rem)]"
              : "hidden",
          )}
        >
          {selected && openContact ? (
            <ContactPanel
              row={selected}
              note={note}
              taskTitle={taskTitle}
              addingTask={addingTask}
              onNoteChange={setNote}
              onTaskTitleChange={setTaskTitle}
              onToggleTaskForm={() => {
                setAddingTask((value) => !value);
                setTaskTitle(selected.openTaskCount ? "" : `Call ${selected.name} back`);
              }}
              onSaveNote={() => void saveNote()}
              onSaveTask={() => void saveTask()}
              onClose={closeContact}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onExpand={() => setFullOpen(true)}
              onEdit={() => setEditOpen(true)}
              onNewJob={() => setJobOpen(true)}
              onEstimate={() =>
                startEstimate.prompt({
                  contactId: selected.id,
                  clientId: openContact.clientId,
                  jobId: selected.jobs[0]?.id ?? null,
                })
              }
              onToggleTask={(id, done) => {
                void crm.toggleTask(id);
                if (done) toast.success("Task done");
              }}
            />
          ) : null}
        </aside>
      </div>

      <CreateClientDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CreateJobDialog
        open={jobOpen}
        onOpenChange={setJobOpen}
        defaultContactId={openContact?.id}
      />
      {openContact ? (
        <EditContactDialog contact={openContact} open={editOpen} onOpenChange={setEditOpen} />
      ) : null}
      {fullOpen && openContact ? (
        <ContactRecordWindow contact={openContact} onClose={() => setFullOpen(false)} />
      ) : null}
      <StartEstimateDialogHost flow={startEstimate} />
    </div>
  );
}

function emptyFilterCopy(filter: ContactFilter) {
  if (filter === "tasks") return "No one needs a call.";
  if (filter === "lead") return "No leads in this book.";
  if (filter === "prop") return "No proposals waiting.";
  if (filter === "cust") return "No customers with active jobs.";
  if (filter === "past") return "No past customers yet.";
  return "Add a contact to start the book.";
}

function ContactRow({
  row,
  compact,
  selected,
  onOpen,
}: {
  row: ContactBookRow;
  compact: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const stage = CONTACT_STAGE_META[row.stage];
  return (
    <div
      role="option"
      tabIndex={0}
      aria-selected={selected}
      data-contact={row.id}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative grid min-h-[62px] cursor-pointer items-center gap-4 border-t border-[rgba(28,25,22,0.05)] px-5 first:border-t-0",
        compact
          ? "grid-cols-[minmax(0,1fr)_6.875rem]"
          : "grid-cols-[minmax(0,1fr)_6.875rem] xl:grid-cols-[minmax(12.5rem,1.4fr)_minmax(0,1.6fr)_8.125rem_7.5rem_6.875rem]",
        selected ? "bg-[#eef3fb]" : "hover:bg-[#fafaf8]",
      )}
    >
      {selected ? (
        <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-[3px] bg-[#0a66d8]" />
      ) : null}
      <div className="flex min-w-0 items-center gap-3">
        <ContactAvatar name={row.name} className="size-[34px] text-xs" />
        <div className="min-w-0">
          <div className="truncate font-medium text-[#1d1d1f]">{row.name}</div>
          <div className="truncate text-[12.5px] text-[#6e6e73]">
            {row.typeLine}
            {row.overdueCallback ? (
              <span className="text-[#8a2f22]"> · Callback overdue</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className={cn("hidden truncate text-[13.5px] text-[#6e6e73]", !compact && "xl:block")}>
        {row.address || "—"}
      </div>
      <div className={cn("hidden truncate text-[13.5px] tabular-nums", !compact && "xl:block")}>
        {row.phone}
      </div>
      <div className={cn("hidden truncate text-[13.5px] text-[#6e6e73]", !compact && "xl:block")}>
        {row.lastContactLabel}
      </div>
      <div>
        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", stage.chip)}>
          {stage.label}
        </span>
      </div>
    </div>
  );
}

function ContactPanel({
  row,
  note,
  taskTitle,
  addingTask,
  onNoteChange,
  onTaskTitleChange,
  onToggleTaskForm,
  onSaveNote,
  onSaveTask,
  onClose,
  onPrev,
  onNext,
  onExpand,
  onEdit,
  onNewJob,
  onEstimate,
  onToggleTask,
}: {
  row: ContactBookRow;
  note: string;
  taskTitle: string;
  addingTask: boolean;
  onNoteChange: (value: string) => void;
  onTaskTitleChange: (value: string) => void;
  onToggleTaskForm: () => void;
  onSaveNote: () => void;
  onSaveTask: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onExpand: () => void;
  onEdit: () => void;
  onNewJob: () => void;
  onEstimate: () => void;
  onToggleTask: (id: string, done: boolean) => void;
}) {
  const stage = CONTACT_STAGE_META[row.stage];
  const tel = digitsOnly(row.phoneRaw);
  const via = row.sourceLabel ? ` · via ${row.sourceLabel}` : "";

  return (
    <>
      <div className="flex items-center gap-1.5 px-3 pt-3 pr-3 pl-[18px]">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            stage.chip,
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {stage.label}
        </span>
        <span className="flex-1" />
        <IconBtn label="Previous contact" onClick={onPrev}>
          <ChevronUp />
        </IconBtn>
        <IconBtn label="Next contact" onClick={onNext}>
          <ChevronDown />
        </IconBtn>
        <IconBtn label="Open full page" onClick={onExpand}>
          <Maximize2 />
        </IconBtn>
        <IconBtn label="Close" onClick={onClose}>
          <X />
        </IconBtn>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pt-1.5 pb-7">
        <div className="mt-2 mb-4 flex items-center gap-3.5">
          <ContactAvatar name={row.name} className="size-14 text-[19px]" />
          <div className="min-w-0">
            <h2 className="text-[22px] leading-tight font-semibold tracking-tight text-[#1d1d1f]">
              {row.name}
            </h2>
            <p className="text-sm text-[#6e6e73]">
              {row.typeLine}
              {via}
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-4 gap-2">
          {tel ? (
            <a href={`tel:${tel}`} className={quickClass}>
              <Phone className="size-5 text-[#13295b]" />
              Call
            </a>
          ) : (
            <button type="button" className={quickClass} onClick={() => toast.message("No phone on file")}>
              <Phone className="size-5 text-[#13295b]" />
              Call
            </button>
          )}
          {tel ? (
            <Link href={`/messages?contact=${row.id}`} className={quickClass}>
              <MessageSquare className="size-5 text-[#13295b]" />
              Text
            </Link>
          ) : (
            <button type="button" className={quickClass} onClick={() => toast.message("No phone on file")}>
              <MessageSquare className="size-5 text-[#13295b]" />
              Text
            </button>
          )}
          {row.email ? (
            <Link
              href={mailHref({ compose: true, email: row.email, contact: row.id })}
              className={quickClass}
            >
              <Mail className="size-5 text-[#13295b]" />
              Email
            </Link>
          ) : (
            <button type="button" className={quickClass} onClick={() => toast.message("No email on file")}>
              <Mail className="size-5 text-[#13295b]" />
              Email
            </button>
          )}
          <button type="button" className={quickClass} onClick={onEstimate}>
            <FilePlus className="size-5 text-[#13295b]" />
            Estimate
          </button>
        </div>

        <section className="mb-5">
          <SectionHead label="Contact" action="Edit" onAction={onEdit} />
          <div className="overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(28,25,22,0.08)]">
            <FieldRow label="Mobile" value={row.phone} copy={row.phoneRaw || undefined} />
            <FieldRow
              label="Email"
              value={row.email || "Add email"}
              faint={!row.email}
              copy={row.email || undefined}
            />
            <FieldRow
              label="Address"
              value={row.address || "Add address"}
              faint={!row.address}
              copy={row.address || undefined}
            />
          </div>
        </section>

        <section className="mb-5">
          <SectionHead label="Jobs" action="New job" onAction={onNewJob} />
          {row.jobs.length === 0 ? (
            <p className="text-[13px] text-[#6e6e73]">No jobs yet.</p>
          ) : (
            row.jobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs?job=${job.id}`}
                className="mb-2 flex items-center gap-3 rounded-xl px-3.5 py-3 shadow-[0_0_0_1px_rgba(28,25,22,0.08)] last:mb-0 hover:bg-[#fafaf8]"
              >
                <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-[#f0efec] text-[#13295b]">
                  <Home className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{job.name}</span>
                  <span className="block truncate text-[12.5px] text-[#6e6e73]">
                    {job.code} · {job.statusLabel}
                  </span>
                </span>
                <ChevronRight className="size-4 text-[#a1a1a6]" />
              </Link>
            ))
          )}
        </section>

        <section className="mb-5">
          <SectionHead label="Tasks" action={addingTask ? "Cancel" : "Add"} onAction={onToggleTaskForm} />
          {addingTask ? (
            <div className="mb-3 flex gap-2">
              <Input
                value={taskTitle}
                onChange={(event) => onTaskTitleChange(event.target.value)}
                placeholder={`Call ${row.name} back`}
                aria-label="Task title"
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSaveTask();
                }}
              />
              <Button type="button" variant="outline" className="rounded-lg" onClick={onSaveTask}>
                Save
              </Button>
            </div>
          ) : null}
          {row.tasks.length === 0 && !addingTask ? (
            <p className="text-[13px] text-[#6e6e73]">Nothing open.</p>
          ) : (
            row.tasks.map((task) => (
              <label
                key={task.id}
                className={cn("flex items-center gap-2.5 py-2", task.completed && "text-[#a1a1a6]")}
              >
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={() => onToggleTask(task.id, !task.completed)}
                  className="size-[18px] rounded-full"
                  aria-label={task.title}
                />
                <span className={cn("flex-1 text-sm", task.completed && "line-through")}>{task.title}</span>
                {!task.completed ? (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      task.late ? "bg-[#f7ebe8] text-[#8a2f22]" : "bg-[#f0efec] text-[#6e6e73]",
                    )}
                  >
                    Due {formatDateShort(task.dueAt)}
                  </span>
                ) : null}
              </label>
            ))
          )}
        </section>

        <section>
          <SectionHead label="Activity" />
          <div className="mb-3 flex gap-2">
            <Input
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Add a note…"
              aria-label="Add a note"
              onKeyDown={(event) => {
                if (event.key === "Enter") onSaveNote();
              }}
            />
            <Button type="button" variant="outline" className="rounded-lg" onClick={onSaveNote}>
              Save
            </Button>
          </div>
          {row.activity.length === 0 ? (
            <p className="text-[13px] text-[#6e6e73]">No activity yet.</p>
          ) : (
            <div className="relative pl-[22px] before:absolute before:top-1.5 before:bottom-1.5 before:left-1.5 before:w-px before:bg-[rgba(28,25,22,0.08)]">
              {row.activity.map((item) => (
                <div key={item.id} className="relative pb-3.5 last:pb-0">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-5 size-2.5 rounded-full border-2 bg-white",
                      item.kind === "note" ? "border-[#8a2f22]" : "border-[#a1a1a6]",
                    )}
                  />
                  <p className="font-medium">{item.title}</p>
                  {item.detail ? <p className="text-[13px] text-[#6e6e73]">{item.detail}</p> : null}
                  <p className="text-xs text-[#a1a1a6]">{item.when}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

const quickClass =
  "flex flex-col items-center gap-1 rounded-xl bg-[#f0efec] px-1 py-2.5 text-xs font-medium text-[#1d1d1f] hover:bg-[#e7e6e2]";

function SectionHead({
  label,
  action,
  onAction,
}: {
  label: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <h3 className="mb-2 flex items-center justify-between text-xs font-semibold text-[#6e6e73]">
      {label}
      {action && onAction ? (
        <button type="button" className="font-medium text-[#0a66d8] hover:underline" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </h3>
  );
}

function FieldRow({
  label,
  value,
  copy,
  faint,
}: {
  label: string;
  value: string;
  copy?: string;
  faint?: boolean;
}) {
  return (
    <div className="group flex items-center gap-3 border-t border-[rgba(28,25,22,0.05)] px-3.5 py-2.5 first:border-t-0">
      <span className="w-[62px] shrink-0 text-xs text-[#6e6e73]">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate", faint && "text-[#a1a1a6]")} title={value}>
        {value}
      </span>
      {copy ? (
        <button
          type="button"
          className="rounded p-0.5 text-[#a1a1a6] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(copy).then(
              () => toast.success("Copied"),
              () => toast.message(copy),
            );
          }}
        >
          <Copy className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-[#6e6e73] hover:bg-[#f0efec] hover:text-[#1d1d1f] [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function ContactAvatar({ name, className }: { name: string; className?: string }) {
  const tone = avatarTone(name || "?");
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold", className)}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {initials(name) || "?"}
    </span>
  );
}
