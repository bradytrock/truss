"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  BULK_INVITE_MAX_ROWS,
  emptyBulkInviteRow,
  emptyBulkInviteRows,
  parseBulkInviteRows,
  type BulkInviteDraft,
} from "@/lib/bulk-invite";
import { requestInviteEmails, type InviteEmailSendResult } from "@/lib/invite-email";
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
  const [results, setResults] = useState<InviteEmailSendResult[] | null>(null);

  const parsed = useMemo(() => parseBulkInviteRows(rows, existingEmails), [existingEmails, rows]);
  const issueByKey = useMemo(
    () => new Map(parsed.issues.map((issue) => [issue.key, issue.message])),
    [parsed.issues],
  );

  function reset() {
    setRows(emptyBulkInviteRows());
    setPending(false);
    setResults(null);
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
      const emailed = await requestInviteEmails(created.map((item) => item.member.id));
      setResults(
        created.map((item) => {
          const row = emailed.results.find((result) => result.staffId === item.member.id);
          return (
            row ?? {
              staffId: item.member.id,
              email: item.member.email,
              name: item.member.name,
              ok: false,
              error: emailed.error || "Invite saved. Copy the link from People if the email did not send.",
            }
          );
        }),
      );
      const sent = emailed.results.filter((row) => row.ok).length;
      if (sent === created.length) {
        toast.success(
          sent === 1 ? "Emailed a one-time setup link." : `Emailed ${sent} one-time setup links.`,
        );
      } else if (sent > 0) {
        toast.message(`Emailed ${sent} of ${created.length}. The rest can copy a link from People.`);
      } else {
        toast.error(emailed.error || "Seats were added. Email did not send — copy links from People.");
      }
    } finally {
      setPending(false);
    }
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
              <DialogTitle>Invites sent</DialogTitle>
              <DialogDescription>
                Each person got their own one-time setup link. After they set a password, that link
                cannot be reused.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[32%]">Person</TableHead>
                    <TableHead className="w-[36%]">Email</TableHead>
                    <TableHead className="w-[32%]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow key={row.staffId}>
                      <TableCell className="font-medium">{row.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email || "—"}</TableCell>
                      <TableCell className={row.ok ? "text-foreground" : "text-destructive"}>
                        {row.ok ? (row.mocked ? "Saved (email not configured)" : "Emailed") : row.error}
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
                Each row gets its own one-time email. They set a password on that link; it cannot be
                reused. Invites expire in {INVITE_DAYS} days.
              </DialogDescription>
            </DialogHeader>
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
                  ? "Fill a name and email to invite."
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
                  ? "Sending…"
                  : parsed.ready.length
                    ? `Email ${parsed.ready.length} ${parsed.ready.length === 1 ? "invite" : "invites"}`
                    : "Email invites"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
