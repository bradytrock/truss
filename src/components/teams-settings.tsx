"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/page-chrome";
import { membersOnTeam, NO_TEAM, parseTeamSelect, selectValueForTeam, teamName } from "@/lib/teams";
import type { StaffMember, Team } from "@/lib/types";
import { SEAT_ROLE_LABELS } from "@/lib/types";

export function TeamsSettings({
  teams,
  staff,
  onAdd,
  onUpdate,
  onRemove,
}: {
  teams: Team[];
  staff: StaffMember[];
  onAdd: (input: { name: string; leadStaffId?: string | null }) => Promise<Team | null>;
  onUpdate: (id: string, patch: { name?: string; leadStaffId?: string | null }) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [editor, setEditor] = useState<{ mode: "add" } | { mode: "edit"; team: Team } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Team | null>(null);
  const sorted = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name)),
    [teams],
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Teams</CardTitle>
            <CardDescription>
              Crews that share a book. Team leads and team admins see jobs and contacts owned by
              people on their team, and can Login As a teammate.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setEditor({ mode: "add" })}>
            <Plus />
            Add team
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {sorted.length === 0 ? (
            <EmptyState
              title="No teams yet"
              description="Add a crew, pick a lead, then put people on it from People below."
              action={
                <Button type="button" onClick={() => setEditor({ mode: "add" })}>
                  Add team
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {sorted.map((team) => {
                const lead = staff.find((member) => member.id === team.leadStaffId);
                const count = membersOnTeam(staff, team.id).length;
                return (
                  <li key={team.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-medium">{team.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {lead ? `Lead: ${lead.name}` : "No lead"}
                        {" · "}
                        {count === 1 ? "1 person" : `${count} people`}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button type="button" variant="outline" size="icon-sm" />}
                      >
                        <MoreHorizontal />
                        <span className="sr-only">Team actions</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditor({ mode: "edit", team })}>
                          Edit team
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget(team)}>
                          Remove team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <TeamEditorDialog
        open={Boolean(editor)}
        team={editor?.mode === "edit" ? editor.team : null}
        staff={staff}
        onOpenChange={(open) => !open && setEditor(null)}
        onSave={async (input) => {
          if (editor?.mode === "edit") {
            const ok = await onUpdate(editor.team.id, input);
            if (ok) setEditor(null);
            return ok;
          }
          const created = await onAdd(input);
          if (created) setEditor(null);
          return Boolean(created);
        }}
      />

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <DialogDescription>
              People on this team are unassigned. Their jobs stay with them. Team leads on this crew
              will only see their own book until you put them on another team.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!removeTarget) return;
                const ok = await onRemove(removeTarget.id);
                if (ok) setRemoveTarget(null);
              }}
            >
              Remove team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TeamSelect({
  id,
  value,
  teams,
  onChange,
  full,
  allowNone = true,
}: {
  id?: string;
  value: string | null | undefined;
  teams: Team[];
  onChange: (teamId: string) => void;
  full?: boolean;
  allowNone?: boolean;
}) {
  const items = [
    ...(allowNone ? [{ value: NO_TEAM, label: "No team" }] : []),
    ...[...teams]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((team) => ({ value: team.id, label: team.name })),
  ];
  return (
    <Select
      value={selectValueForTeam(value)}
      onValueChange={(next) => onChange(parseTeamSelect(String(next ?? "")) )}
      items={items}
    >
      <SelectTrigger id={id} className={full ? "w-full" : "w-44"} size={full ? "default" : "sm"}>
        <SelectValue placeholder="No team" />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NO_TEAM}>No team</SelectItem> : null}
        {[...teams]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function TeamEditorDialog({
  open,
  team,
  staff,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  team: Team | null;
  staff: StaffMember[];
  onOpenChange: (open: boolean) => void;
  onSave: (input: { name: string; leadStaffId: string | null }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [leadId, setLeadId] = useState(NO_TEAM);
  const [pending, setPending] = useState(false);
  const people = useMemo(
    () =>
      [...staff]
        .filter((member) => !member.locked || member.id === team?.leadStaffId)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [staff, team?.leadStaffId],
  );

  const leadItems = [
    { value: NO_TEAM, label: "No lead" },
    ...people.map((member) => ({
      value: member.id,
      label: `${member.name} · ${SEAT_ROLE_LABELS[member.role]}`,
    })),
  ];

  useEffect(() => {
    if (!open) {
      setName("");
      setLeadId(NO_TEAM);
      return;
    }
    setName(team?.name ?? "");
    setLeadId(selectValueForTeam(team?.leadStaffId));
  }, [open, team]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await onSave({ name, leadStaffId: parseTeamSelect(leadId) || null });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{team ? `Edit ${team.name}` : "Add team"}</DialogTitle>
            <DialogDescription>
              Naming a lead puts them on this team. They can still have a different seat role.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                placeholder="Denver production"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="team-lead">Lead</Label>
              <Select
                value={leadId}
                onValueChange={(value) => setLeadId(String(value ?? NO_TEAM))}
                items={leadItems}
              >
                <SelectTrigger id="team-lead" className="w-full">
                  <SelectValue placeholder="No lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEAM}>No lead</SelectItem>
                  {people.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} · {SEAT_ROLE_LABELS[member.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" nativeButton disabled={pending || !name.trim()}>
              {pending ? "Saving…" : team ? "Save team" : "Add team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function staffTeamLabel(teams: Team[], member: StaffMember) {
  return teamName(teams, member.teamId) || "No team";
}
