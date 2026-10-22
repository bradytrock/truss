"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MoreHorizontal, Plus, UsersRound } from "lucide-react";
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
import Link from "next/link";
import { SettingsCard, SettingsPageHeader } from "@/components/settings-chrome";
import { TeamPeopleTabs } from "@/components/people-settings-chrome";
import { membersOnTeam, NO_TEAM, parseTeamSelect, selectValueForTeam, teamName } from "@/lib/teams";
import type { StaffMember, Team } from "@/lib/types";
import { SEAT_ROLE_LABELS } from "@/lib/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const TEAM_SETUPS: Array<{ name: string; description: string; roles: StaffMember["role"][] }> = [
  {
    name: "Sales",
    description: "Project managers and business development. New leads route here first.",
    roles: ["project_manager", "business_development", "estimator", "team_lead"],
  },
  {
    name: "Production",
    description: "Runs builds, crews, and materials once a job is sold.",
    roles: ["superintendent"],
  },
  {
    name: "Office",
    description: "Paperwork, insurance supplements, invoicing, and collections.",
    roles: ["company_admin", "accountant", "team_admin"],
  },
];

export function TeamsSettings({
  teams,
  staff,
  onAdd,
  onUpdate,
  onRemove,
  onAssign,
}: {
  teams: Team[];
  staff: StaffMember[];
  onAdd: (input: { name: string; leadStaffId?: string | null }) => Promise<Team | null>;
  onUpdate: (id: string, patch: { name?: string; leadStaffId?: string | null }) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onAssign?: (staffId: string, teamId: string | null) => Promise<boolean>;
}) {
  const [editor, setEditor] = useState<{ mode: "add" } | { mode: "edit"; team: Team } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Team | null>(null);
  const sorted = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name)),
    [teams],
  );
  const unassigned = useMemo(
    () => staff.filter((member) => !member.teamId && !member.locked),
    [staff],
  );
  const [applying, setApplying] = useState<string | null>(null);

  async function applySetup(setup: (typeof TEAM_SETUPS)[number]) {
    setApplying(setup.name);
    try {
      let team = teams.find((item) => item.name.toLowerCase() === setup.name.toLowerCase()) ?? null;
      if (!team) team = await onAdd({ name: setup.name });
      if (!team) return;
      const matches = unassigned.filter((member) => setup.roles.includes(member.role));
      if (onAssign) {
        for (const member of matches) {
          await onAssign(member.id, team.id);
        }
      }
      toast.success(
        matches.length
          ? `${setup.name} is ready with ${matches.length} ${matches.length === 1 ? "person" : "people"}.`
          : `${setup.name} is ready. Add people from the unassigned list.`,
      );
    } finally {
      setApplying(null);
    }
  }

  return (
    <>
      <SettingsPageHeader
        eyebrow="Team"
        title="Teams"
        description="Group people for lead routing, ring groups, and reporting. Each person sits on one team."
        actions={
          <Button type="button" className="rounded-lg" onClick={() => setEditor({ mode: "add" })}>
            <Plus />
            New team
          </Button>
        }
      />
      <TeamPeopleTabs />

      <SettingsCard className="px-5 py-10 text-center">
        {sorted.length === 0 ? (
          <>
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-primary">
              <UsersRound className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">No teams yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              All {unassigned.length} people are unassigned. Start from a common setup below, or build your own.
            </p>
          </>
        ) : (
          <ul className="space-y-3 text-left">
            {sorted.map((team) => {
              const members = membersOnTeam(staff, team.id);
              const lead = staff.find((member) => member.id === team.leadStaffId);
              return (
                <li key={team.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#f0ece8] px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{team.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead ? `Lead: ${lead.name}` : "No lead"}
                      {" · "}
                      {members.length === 1 ? "1 person" : `${members.length} people`}
                    </p>
                    {members.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {members.map((member) => (
                          <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#f6f4f1] px-2 py-0.5 text-xs">
                            <span className="font-medium text-muted-foreground">{initials(member.name)}</span>
                            {member.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon-sm" />}>
                      <MoreHorizontal />
                      <span className="sr-only">Team actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditor({ mode: "edit", team })}>Edit team</DropdownMenuItem>
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
      </SettingsCard>

      <div>
        <h2 className="text-sm font-semibold">Start from a common setup</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {TEAM_SETUPS.map((setup) => {
            const suggested = staff.filter((member) => !member.locked && setup.roles.includes(member.role));
            return (
              <SettingsCard key={setup.name} className="flex flex-col p-4">
                <h3 className="font-medium">{setup.name}</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{setup.description}</p>
                {suggested.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {suggested.slice(0, 6).map((member) => (
                      <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#f6f4f1] px-2 py-0.5 text-xs">
                        <span className="font-medium text-muted-foreground">{initials(member.name)}</span>
                        {member.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-fit rounded-lg bg-white"
                  disabled={applying === setup.name}
                  onClick={() => void applySetup(setup)}
                >
                  {applying === setup.name ? "Setting up…" : "Use this setup"}
                </Button>
              </SettingsCard>
            );
          })}
        </div>
      </div>

      <SettingsCard className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Unassigned <span className="text-muted-foreground">{unassigned.length}</span>
          </h2>
          <Link href="/settings/people" className="text-sm font-medium text-primary hover:underline">
            Manage people
          </Link>
        </div>
        {unassigned.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Everyone is on a team.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unassigned.map((member) => (
              <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full border border-[#eeeae6] bg-white px-2.5 py-1 text-xs">
                <span className="font-medium text-muted-foreground">{initials(member.name)}</span>
                {member.name}
              </span>
            ))}
          </div>
        )}
      </SettingsCard>

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
  disabled = false,
  triggerClassName,
}: {
  id?: string;
  value: string | null | undefined;
  teams: Team[];
  onChange: (teamId: string) => void;
  full?: boolean;
  allowNone?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
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
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        disabled={disabled}
        className={cn(full ? "w-full" : "w-44", triggerClassName)}
        size={full ? "default" : "sm"}
      >
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
