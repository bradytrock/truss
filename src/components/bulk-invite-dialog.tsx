"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamSelect } from "@/components/teams-settings";
import { defaultTitleForRole, INVITE_DAYS } from "@/lib/accounts";
import {
  BULK_INVITE_CSV_TEMPLATE,
  BULK_INVITE_MAX_ROWS,
  emptyBulkInviteRow,
  emptyBulkInviteRows,
  mergeBulkInviteRows,
  parseBulkInviteCsv,
  parseBulkInviteRows,
  type BulkInviteCsvIssue,
  type BulkInviteDraft,
} from "@/lib/bulk-invite";
import { downloadCatalogCsv } from "@/lib/catalog-csv";
import { copyText } from "@/lib/share";
import { NO_TEAM, parseTeamSelect } from "@/lib/teams";
import type { SeatRole, StaffMember, Team } from "@/lib/types";
import { SEAT_ROLE_LABELS, SEAT_ROLES } from "@/lib/types";

const ROLE_ITEMS = SEAT_ROLES.map((role) => ({
  value: role,
  label: SEAT_ROLE_LABELS[role],
}));

export function BulkInviteDialog({
  open,
  teams,
  existingEmails,
  onOpenChange,
  onInviteMany,
}: {
  open: boolean;
  teams: Team[];
  existingEmails: string[];
  onOpenChange: (open: boolean) => void;
  onInviteMany: (
    rows: Array<{
      name: string;
      email: string;
      role: SeatRole;
      title?: string;
      teamId?: string | null;
    }>,
  ) => Promise<Array<{ member: StaffMember; inviteUrl: string | null }>>;
}) {
  const [rows, setRows] = useState<BulkInviteDraft[]>(() => emptyBulkInviteRows());
  const [pending, setPending] = useState(false);
  const [csvIssues, setCsvIssues] = useState<BulkInviteCsvIssue[]>([]);
  const [results, setResults] = useState<Array<{ member: StaffMember; inviteUrl: string | null }> | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseBulkInviteRows(rows, existingEmails), [existingEmails, rows]);
  const issueByKey = useMemo(
    () => new Map(parsed.issues.map((issue) => [issue.key, issue.message])),
    [parsed.issues],
  );

  function reset() {
    setRows(emptyBulkInviteRows());
    setPending(false);
    setCsvIssues([]);
    setResults(null);
  }

  function readCsv(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Keep the CSV under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseBulkInviteCsv(String(reader.result ?? ""), teams);
        if (imported.rows.length === 0) {
          toast.error("No people found in that file. Use the columns name, email, role, team, title.");
          return;
        }
        const merged = mergeBulkInviteRows(rows, imported.rows);
        setRows(merged.rows);
        setCsvIssues(imported.issues);
        const loaded = imported.rows.length - merged.skipped;
        const skipped = imported.skipped + merged.skipped;
        if (skipped > 0) {
          toast.message(
            `Loaded ${loaded} people. ${skipped} more did not fit — add at most ${BULK_INVITE_MAX_ROWS} at a time.`,
          );
        } else {
          toast.success(`Loaded ${loaded} ${loaded === 1 ? "person" : "people"} from ${file.name}.`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not read that CSV.");
      }
    };
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsText(file);
  }

  function patchRow(key: string, patch: Partial<BulkInviteDraft>) {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.role && (!row.title || row.title === defaultTitleForRole(row.role))) {
          next.title = defaultTitleForRole(patch.role);
        }
        return next;
      }),
    );
  }

  async function onSubmit() {
    const { ready, issues } = parseBulkInviteRows(rows, existingEmails);
    if (issues.length) {
      toast.error(issues[0]?.message || "Fix the highlighted rows.");
      return;
    }
    if (!ready.length) {
      toast.error("Add at least one name and email.");
      return;
    }
    setPending(true);
    try {
      const created = await onInviteMany(
        ready.map((row) => ({
          name: row.name,
          email: row.email,
          role: row.role,
          title: row.title,
          teamId: parseTeamSelect(row.teamId),
        })),
      );
      if (!created.length) return;
      setResults(created);
      toast.success(
        created.length === 1
          ? "Added 1 person. No invite email was sent."
          : `Added ${created.length} people. No invite emails were sent.`,
      );
    } finally {
      setPending(false);
    }
  }

  async function copyLink(url: string) {
    const ok = await copyText(url);
    if (ok) toast.success("Invite link copied.");
    else toast.error("Could not copy the link. Select it and copy it yourself.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-5xl">
        {results ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Added {results.length} {results.length === 1 ? "person" : "people"}
              </DialogTitle>
              <DialogDescription>
                No invite emails were sent. When you are ready, use Email invite from each person’s
                menu in People, or copy a link below. Each link works once and expires in{" "}
                {INVITE_DAYS} days.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Person</TableHead>
                    <TableHead className="w-[40%]">Email</TableHead>
                    <TableHead className="w-[30%]">Invite link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(({ member, inviteUrl }) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name || "—"}</TableCell>
                      <TableCell className="truncate text-muted-foreground">{member.email || "—"}</TableCell>
                      <TableCell>
                        {inviteUrl ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => void copyLink(inviteUrl)}>
                            <Copy />
                            Copy link
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">Create one from People</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Bulk add people</DialogTitle>
              <DialogDescription>
                Upload a CSV or type rows below. Seats are added without emailing anyone — send each
                invite later from People. Invite links work once and expire in {INVITE_DAYS} days.
              </DialogDescription>
            </DialogHeader>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              aria-label="Upload CSV"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) readCsv(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload />
                Upload CSV
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => downloadCatalogCsv("people-template.csv", BULK_INVITE_CSV_TEMPLATE)}
              >
                Template
              </Button>
              <p className="text-xs text-muted-foreground">
                Columns: name, email, role, team, title. Role and team can be blank.
              </p>
            </div>
            {csvIssues.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-medium">
                  {csvIssues.length} {csvIssues.length === 1 ? "row needs" : "rows need"} a look. Fix
                  them in the grid below.
                </p>
                <ul className="mt-1 grid gap-0.5">
                  {csvIssues.slice(0, 5).map((issue) => (
                    <li key={`${issue.line}-${issue.message}`}>
                      Line {issue.line}: {issue.message}
                    </li>
                  ))}
                  {csvIssues.length > 5 ? <li>…and {csvIssues.length - 5} more.</li> : null}
                </ul>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <Table className="table-fixed min-w-[52rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">Name</TableHead>
                    <TableHead className="w-[24%]">Email</TableHead>
                    <TableHead className="w-[18%]">Role</TableHead>
                    <TableHead className="w-[16%]">Team</TableHead>
                    <TableHead className="w-[16%]">Title</TableHead>
                    <TableHead className="w-[6%]">
                      <span className="sr-only">Remove</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const issue = issueByKey.get(row.key);
                    const last = rows[index - 1];
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="align-top">
                          <Input
                            value={row.name}
                            onChange={(event) => patchRow(row.key, { name: event.target.value })}
                            placeholder={last?.name ? "" : "Alex Rivera"}
                            aria-label={`Name ${index + 1}`}
                          />
                          {issue ? <p className="mt-1 text-xs text-destructive">{issue}</p> : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            type="email"
                            value={row.email}
                            onChange={(event) => patchRow(row.key, { email: event.target.value })}
                            placeholder="alex@company.com"
                            aria-label={`Email ${index + 1}`}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Select
                            value={row.role}
                            onValueChange={(value) =>
                              patchRow(row.key, { role: String(value ?? row.role) as SeatRole })
                            }
                            items={ROLE_ITEMS}
                          >
                            <SelectTrigger className="w-full" aria-label={`Role ${index + 1}`}>
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
                        </TableCell>
                        <TableCell className="align-top">
                          <TeamSelect
                            id={`bulk-team-${row.key}`}
                            value={row.teamId || NO_TEAM}
                            teams={teams}
                            onChange={(teamId) => patchRow(row.key, { teamId })}
                            full
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            value={row.title}
                            onChange={(event) => patchRow(row.key, { title: event.target.value })}
                            aria-label={`Title ${index + 1}`}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={rows.length <= 1}
                            onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                          >
                            <Trash2 />
                            <span className="sr-only">Remove row</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={rows.length >= BULK_INVITE_MAX_ROWS}
                onClick={() => {
                  const last = rows[rows.length - 1];
                  setRows((current) => [
                    ...current,
                    emptyBulkInviteRow(last?.role ?? "project_manager", last?.teamId ?? ""),
                  ]);
                }}
              >
                <Plus />
                Add row
              </Button>
              <p className="text-xs text-muted-foreground">
                {parsed.ready.length === 0
                  ? "Fill a name and email, or upload a CSV."
                  : `${parsed.ready.length} ${parsed.ready.length === 1 ? "person" : "people"} ready`}
                {parsed.issues.length ? ` · ${parsed.issues.length} to fix` : ""}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                nativeButton
                disabled={pending || parsed.ready.length === 0 || parsed.issues.length > 0}
                onClick={() => void onSubmit()}
              >
                {pending
                  ? "Adding…"
                  : parsed.ready.length
                    ? `Add ${parsed.ready.length} ${parsed.ready.length === 1 ? "person" : "people"}`
                    : "Add people"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
