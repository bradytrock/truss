"use client";

import { useMemo, useRef, useState } from "react";
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  ImageIcon,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsCard, SettingsPageHeader } from "@/components/settings-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatFileSize } from "@/lib/format";
import {
  COMPANY_FILE_CATEGORIES,
  COMPANY_FILE_CATEGORY_LABELS,
  type CompanyFile,
  type CompanyFileCategory,
} from "@/lib/types";
import {
  companyFileCategoryLabel,
  companyFileSearchText,
  companyFilesList,
  isCompanyFileCategory,
} from "@/lib/company-files";
import { cn } from "@/lib/utils";

export function CompanyFilesPanel() {
  const crm = useCrm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<CompanyFileCategory>("warranty");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CompanyFileCategory | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companyFilesList(crm.companyFiles)
      .filter((file) => (filter === "all" ? true : file.category === filter))
      .filter((file) => (needle ? companyFileSearchText(file).includes(needle) : true))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [crm.companyFiles, filter, query]);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      const saved = await crm.addCompanyFiles(Array.from(list), { category });
      if (saved.length === 1) toast.success(`Added ${saved[0].name} to the directory.`);
      else if (saved.length > 1) toast.success(`Added ${saved.length} files to the directory.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function rename(file: CompanyFile) {
    const name = draftName.trim();
    if (!name || name === file.name) {
      setEditingId(null);
      return;
    }
    const ok = await crm.updateCompanyFile(file.id, { name });
    if (ok) {
      toast.success("File renamed.");
      setEditingId(null);
    }
  }

  async function changeCategory(file: CompanyFile, next: CompanyFileCategory) {
    if (next === file.category) return;
    const ok = await crm.updateCompanyFile(file.id, { category: next });
    if (ok) toast.success(`Moved to ${COMPANY_FILE_CATEGORY_LABELS[next]}.`);
  }

  async function remove(file: CompanyFile) {
    if (!window.confirm(`Remove ${file.name} from the company directory? Jobs that already have a copy keep theirs.`)) {
      return;
    }
    const ok = await crm.deleteCompanyFile(file.id);
    if (ok) toast.success(`${file.name} removed.`);
  }

  const folders: Array<{ id: CompanyFileCategory; title: string; hint: string }> = [
    { id: "warranty", title: "Manufacturer warranties", hint: "By shingle and metal system" },
    { id: "product", title: "Product sheets", hint: "Colors, specs, and brochures" },
    { id: "insurance", title: "Insurance & licensing", hint: "COI, W-9, license copies" },
    { id: "template", title: "Homeowner guides", hint: "What to expect on build day" },
    { id: "other", title: "Other paperwork", hint: "Everything else the crew sends" },
  ];

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        eyebrow="Operations"
        title="File directory"
        description="Warranties, product sheets, and company paperwork your team attaches to jobs and sends to homeowners."
        actions={
          <Button type="button" className="rounded-lg" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <Upload data-icon="inline-start" />
            {uploading ? "Uploading…" : "Upload PDFs"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {folders.map((folder) => {
          const active = filter === folder.id;
          const count = companyFilesList(crm.companyFiles).filter((file) => file.category === folder.id).length;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                setFilter(folder.id);
                setCategory(folder.id);
              }}
              className={cn(
                "rounded-2xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(28,25,23,0.04)]",
                active ? "border-primary ring-1 ring-primary" : "border-[#ebe7e2] hover:border-[#ddd7d0]",
              )}
            >
              <span className={cn("flex size-9 items-center justify-center rounded-xl", active ? "bg-rose-50 text-primary" : "bg-[#f6f4f1] text-muted-foreground")}>
                <FileText className="size-4" />
              </span>
              <span className="mt-3 block text-sm font-medium">{folder.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {folder.hint}
                {count ? ` · ${count}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <SettingsCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{COMPANY_FILE_CATEGORY_LABELS[category]}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilter("all")}>
            {filter === "all" ? "Showing every folder" : "Show all folders"}
          </Button>
        </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void upload(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void upload(event.dataTransfer.files);
        }}
        className={cn(
          "mt-3 flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#e0dbd4] bg-[#fbfaf8] px-4 py-8 text-sm",
          dragOver && "border-primary bg-rose-50/40",
        )}
      >
        <span className="font-medium">{uploading ? "Uploading…" : "Drop PDFs here"}</span>
        <span className="mt-1 text-muted-foreground">
          or <span className="text-primary">browse your computer</span> · PDF up to 25 MB
        </span>
      </button>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the directory"
          className="sm:max-w-xs"
        />
        <Select
          value={filter}
          onValueChange={(value) => setFilter((value as CompanyFileCategory | "all") ?? "all")}
          items={[
            { value: "all", label: "All categories" },
            ...COMPANY_FILE_CATEGORIES.map((item) => ({
              value: item,
              label: COMPANY_FILE_CATEGORY_LABELS[item],
            })),
          ]}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {COMPANY_FILE_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {COMPANY_FILE_CATEGORY_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query || filter !== "all"
            ? "No directory files match that search."
            : "No company files yet. Upload warranties, product PDFs, and estimate attachments here."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file) => {
            const Icon = iconForFile(file);
            const editing = editingId === file.id;
            return (
              <li key={file.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border bg-muted text-muted-foreground">
                  {(file.mimeType ?? "").startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.url} alt="" className="size-10 rounded-sm object-cover" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <Input
                      value={draftName}
                      autoFocus
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => void rename(file)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void rename(file);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      }}
                    />
                  ) : (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-medium hover:underline"
                      onClick={() => {
                        void crm.logAudit({
                          entityType: "company_file",
                          entityId: file.id,
                          action: "opened",
                          after: { name: file.name, url: file.url, category: file.category },
                          label: file.name,
                        });
                      }}
                    >
                      {file.name}
                    </a>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Select
                      value={isCompanyFileCategory(file.category) ? file.category : "other"}
                      onValueChange={(value) =>
                        void changeCategory(file, (value as CompanyFileCategory) ?? file.category)
                      }
                      items={COMPANY_FILE_CATEGORIES.map((item) => ({
                        value: item,
                        label: COMPANY_FILE_CATEGORY_LABELS[item],
                      }))}
                    >
                      <SelectTrigger size="sm" className="h-7 w-auto min-w-[7.5rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_FILE_CATEGORIES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {COMPANY_FILE_CATEGORY_LABELS[item]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {[formatFileSize(file.sizeBytes), formatDate(file.createdAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Rename ${file.name}`}
                  onClick={() => {
                    setEditingId(file.id);
                    setDraftName(file.name);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => void remove(file)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      </SettingsCard>
    </div>
  );
}

function iconForFile(file: CompanyFile) {
  const mime = (file.mimeType ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) return Film;
  if (mime.includes("spreadsheet") || mime.includes("excel") || /\.(xlsx|xls|csv)$/.test(name)) {
    return FileSpreadsheet;
  }
  if (mime.includes("zip") || mime.includes("compressed") || /\.(zip|rar|7z)$/.test(name)) {
    return FileArchive;
  }
  if (mime.startsWith("image/")) return ImageIcon;
  return FileText;
}

export function CompanyFilePickerList({
  onPick,
  disabled,
}: {
  onPick: (file: CompanyFile) => void | Promise<void>;
  disabled?: boolean;
}) {
  const crm = useCrm();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const files = useMemo(
    () =>
      companyFilesList(crm.companyFiles).sort((a, b) => {
        const byCat = a.category.localeCompare(b.category);
        if (byCat !== 0) return byCat;
        return a.name.localeCompare(b.name);
      }),
    [crm.companyFiles],
  );

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No company directory files yet. A company admin can upload warranties and product sheets under
        Settings → File directory.
      </p>
    );
  }

  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto">
      {files.map((file) => (
        <li key={file.id}>
          <button
            type="button"
            disabled={disabled || pendingId === file.id}
            onClick={() => {
              setPendingId(file.id);
              void Promise.resolve(onPick(file)).finally(() => setPendingId(null));
            }}
            className={cn(
              "flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted/40",
              pendingId === file.id && "opacity-60",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{file.name}</span>
              <span className="block text-xs text-muted-foreground">
                {companyFileCategoryLabel(file.category)} · {formatFileSize(file.sizeBytes)}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {pendingId === file.id ? "Adding…" : "Add"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
