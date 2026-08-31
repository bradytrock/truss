"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/page-chrome";
import { staffTeamLabel, TeamSelect } from "@/components/teams-settings";
import {
  defaultTitleForRole,
  INVITE_DAYS,
  inviteIsExpired,
  inviteIsPending,
  inviteSignupUrl,
  staffStatusLabel,
} from "@/lib/accounts";
import { formatDate, formatPhone } from "@/lib/format";
import { copyText } from "@/lib/share";
import { NO_TEAM, parseTeamSelect } from "@/lib/teams";
import type { SeatRole, StaffMember, Team } from "@/lib/types";
import { SEAT_ROLE_LABELS, SEAT_ROLES } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_ITEMS = SEAT_ROLES.map((role) => ({
  value: role,
  label: SEAT_ROLE_LABELS[role],
}));

function statusClass(member: StaffMember) {
  const label = staffStatusLabel(member);
  if (label === "Locked") return "border-destructive/30 bg-destructive/8 text-destructive";
  if (label === "Restricted") return "border-border bg-foreground/[0.06] text-foreground";
  if (label === "Invite expired") return "border-border text-muted-foreground";
  if (label === "Invited") return "border-primary/30 bg-primary/8 text-primary";
  return "border-border bg-transparent text-foreground/80";
}

async function copyInvite(url: string) {
  const ok = await copyText(url);
  if (ok) toast.success("Invite link copied.");
  else toast.error("Could not copy the link. Select it and copy it yourself.");
}

export function PeopleSettings({
  teams,
  staff,
  viewerId,
  onInvite,
  onUpdate,
  onRefreshInvite,
  onRemove,
  hideIntro = false,
}: {
  teams: Team[];
  staff: StaffMember[];
  viewerId: string;
  onInvite: (input: {
    name: string;
    email: string;
    role: SeatRole;
    title?: string;
    phone?: string;
    teamId?: string | null;
  }) => Promise<{ member: StaffMember; inviteUrl: string | null } | null>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<StaffMember, "name" | "title" | "role" | "email" | "phone" | "locked" | "restricted" | "teamId">>,
  ) => Promise<boolean>;
  onRefreshInvite: (id: string) => Promise<string | null>;
  onRemove: (id: string) => Promise<boolean>;
  hideIntro?: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [profileTarget, setProfileTarget] = useState<StaffMember | null>(null);
  const people = useMemo(
    () =>
      [...staff].sort((left, right) => {
        if (left.id === viewerId) return -1;
        if (right.id === viewerId) return 1;
        return left.name.localeCompare(right.name);
      }),
    [staff, viewerId],
  );

  async function showInvite(url: string | null, name: string) {
    if (!url) return;
    setInviteName(name);
    setInviteUrl(url);
    await copyInvite(url);
  }

  return (
    <>
      <Card>
        <CardHeader
          className={
            hideIntro
              ? "flex flex-row items-center justify-end border-b"
              : "flex flex-col gap-3 border-b sm:flex-row sm:items-start sm:justify-between"
          }
        >
          {hideIntro ? null : (
            <div className="space-y-1.5">
              <CardTitle>People</CardTitle>
              <CardDescription>
                Add a roster seat, put them on a team, send a signup link into this company, restrict
                someone to their own book, lock a login, or remove them. Invites expire in {INVITE_DAYS}{" "}
                days.
              </CardDescription>
            </div>
          )}
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Plus />
            Add teammate
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {people.length === 0 ? (
            <EmptyState
              title="No seats yet"
              description="Add the people who run jobs, estimates, and the office. An email creates a signup link; skip it to assign work before they have a login."
              action={
                <Button type="button" onClick={() => setAddOpen(true)}>
                  Add teammate
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {people.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {member.name}
                              {member.id === viewerId ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>
                              ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground">{member.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.email || "No email"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.phone ? formatPhone(member.phone) : "—"}
                        </TableCell>
                        <TableCell>
                          <RoleSelect
                            member={member}
                            onChange={(role) => void onUpdate(member.id, { role })}
                          />
                        </TableCell>
                        <TableCell>
                          <TeamSelect
                            value={member.teamId}
                            teams={teams}
                            onChange={(teamId) => void onUpdate(member.id, { teamId })}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge member={member} />
                        </TableCell>
                        <TableCell className="text-right">
                          <SeatMenu
                            member={member}
                            isSelf={member.id === viewerId}
                            onEditProfile={() => setProfileTarget(member)}
                            onUpdate={onUpdate}
                            onRefreshInvite={async () => {
                              const url = await onRefreshInvite(member.id);
                              await showInvite(url, member.name);
                            }}
                            onCopyInvite={async () => {
                              if (member.inviteToken) {
                                await copyInvite(inviteSignupUrl(window.location.origin, member.inviteToken));
                                return;
                              }
                              const url = await onRefreshInvite(member.id);
                              await showInvite(url, member.name);
                            }}
                            onRemove={() => setRemoveTarget(member)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:hidden">
                {people.map((member) => (
                  <div key={member.id} className="grid gap-3 border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {member.name}
                          {member.id === viewerId ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{member.email || "No email"}</p>
                        {member.phone ? (
                          <p className="text-sm text-muted-foreground">{formatPhone(member.phone)}</p>
                        ) : null}
                      </div>
                      <StatusBadge member={member} />
                    </div>
                    <RoleSelect
                      member={member}
                      onChange={(role) => void onUpdate(member.id, { role })}
                      full
                    />
                    <div className="grid gap-1.5">
                      <p className="text-xs text-muted-foreground">
                        Team · {staffTeamLabel(teams, member)}
                      </p>
                      <TeamSelect
                        value={member.teamId}
                        teams={teams}
                        onChange={(teamId) => void onUpdate(member.id, { teamId })}
                        full
                      />
                    </div>
                    <SeatMenu
                      member={member}
                      isSelf={member.id === viewerId}
                      onEditProfile={() => setProfileTarget(member)}
                      onUpdate={onUpdate}
                      onRefreshInvite={async () => {
                        const url = await onRefreshInvite(member.id);
                        await showInvite(url, member.name);
                      }}
                      onCopyInvite={async () => {
                        if (member.inviteToken) {
                          await copyInvite(inviteSignupUrl(window.location.origin, member.inviteToken));
                          return;
                        }
                        const url = await onRefreshInvite(member.id);
                        await showInvite(url, member.name);
                      }}
                      onRemove={() => setRemoveTarget(member)}
                      full
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AddTeammateDialog
        open={addOpen}
        teams={teams}
        onOpenChange={setAddOpen}
        onInvite={async (input) => {
          const result = await onInvite(input);
          if (!result) return false;
          setAddOpen(false);
          await showInvite(result.inviteUrl, result.member.name);
          return true;
        }}
      />

      <Dialog open={Boolean(inviteUrl)} onOpenChange={(open) => !open && setInviteUrl(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite {inviteName}</DialogTitle>
            <DialogDescription>
              They sign up with this link and join this company. The link is not emailed from Truss —
              copy it into a text or email.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="people-invite-url">Signup link</Label>
            <div className="flex gap-2">
              <Input
                id="people-invite-url"
                readOnly
                value={inviteUrl ?? ""}
                onFocus={(event) => event.target.select()}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!inviteUrl}
                onClick={() => inviteUrl && void copyInvite(inviteUrl)}
              >
                <Copy />
                Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <DialogDescription>
              Their jobs and contacts move to you. Pending invites are void. If they already have a
              login, it is dropped from this company until you send a new invite.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              Keep them
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
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditProfileDialog
        member={profileTarget}
        teams={teams}
        onOpenChange={(open) => !open && setProfileTarget(null)}
        onSave={async (patch) => {
          if (!profileTarget) return false;
          const ok = await onUpdate(profileTarget.id, patch);
          if (ok) setProfileTarget(null);
          return ok;
        }}
      />
    </>
  );
}

function StatusBadge({ member }: { member: StaffMember }) {
  const label = staffStatusLabel(member);
  const hint =
    inviteIsPending(member) && member.inviteExpiresAt
      ? inviteIsExpired(member)
        ? `Expired ${formatDate(member.inviteExpiresAt)}`
        : `Expires ${formatDate(member.inviteExpiresAt)}`
      : null;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant="outline" className={cn(statusClass(member))}>
        {label}
      </Badge>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function RoleSelect({
  member,
  onChange,
  full,
}: {
  member: StaffMember;
  onChange: (role: SeatRole) => void;
  full?: boolean;
}) {
  return (
    <Select
      value={member.role}
      onValueChange={(value) => onChange(String(value ?? member.role) as SeatRole)}
      items={ROLE_ITEMS}
    >
      <SelectTrigger className={full ? "w-full" : "w-44"} size="sm">
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
  );
}

function SeatMenu({
  member,
  isSelf,
  onEditProfile,
  onUpdate,
  onRefreshInvite,
  onCopyInvite,
  onRemove,
  full,
}: {
  member: StaffMember;
  isSelf: boolean;
  onEditProfile: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<StaffMember, "locked" | "restricted">>,
  ) => Promise<boolean>;
  onRefreshInvite: () => Promise<void>;
  onCopyInvite: () => Promise<void>;
  onRemove: () => void;
  full?: boolean;
}) {
  const canInvite = Boolean(member.email) && !member.locked;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size={full ? "default" : "icon-sm"}
            className={full ? "w-full" : undefined}
          />
        }
      >
        {full ? "Account" : <MoreHorizontal />}
        {full ? null : <span className="sr-only">Account actions</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEditProfile}>Edit profile</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canInvite} onClick={() => void onCopyInvite()}>
          Copy invite link
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canInvite} onClick={() => void onRefreshInvite()}>
          {inviteIsPending(member) ? "Refresh invite" : "Send invite"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSelf}
          onClick={() => void onUpdate(member.id, { restricted: !member.restricted })}
        >
          {member.restricted ? "Lift restriction" : "Restrict to own book"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isSelf}
          onClick={() => void onUpdate(member.id, { locked: !member.locked })}
        >
          {member.locked ? "Unlock login" : "Lock login"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isSelf} variant="destructive" onClick={onRemove}>
          Remove from company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddTeammateDialog({
  open,
  teams,
  onOpenChange,
  onInvite,
}: {
  open: boolean;
  teams: Team[];
  onOpenChange: (open: boolean) => void;
  onInvite: (input: {
    name: string;
    email: string;
    role: SeatRole;
    title?: string;
    phone?: string;
    teamId?: string | null;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<SeatRole>("project_manager");
  const [title, setTitle] = useState(defaultTitleForRole("project_manager"));
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [pending, setPending] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setRole("project_manager");
    setTitle(defaultTitleForRole("project_manager"));
    setTeamId(NO_TEAM);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const ok = await onInvite({ name, email, role, title, phone, teamId: parseTeamSelect(teamId) });
      if (ok) reset();
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add teammate</DialogTitle>
            <DialogDescription>
              An email creates a signup link into this company. Leave it blank to add a seat you can
              assign work to before they have a login.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="seat-name">Name</Label>
              <Input
                id="seat-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                placeholder="Alex Rivera"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seat-email">Email</Label>
              <Input
                id="seat-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@company.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seat-phone">Phone</Label>
              <Input
                id="seat-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(303) 555-0142"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="seat-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(value) => {
                    const next = String(value ?? role) as SeatRole;
                    setRole(next);
                    if (!title || title === defaultTitleForRole(role)) {
                      setTitle(defaultTitleForRole(next));
                    }
                  }}
                  items={ROLE_ITEMS}
                >
                  <SelectTrigger id="seat-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEAT_ROLES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {SEAT_ROLE_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="seat-title">Title</Label>
                <Input
                  id="seat-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seat-team">Team</Label>
              <TeamSelect id="seat-team" value={teamId} teams={teams} onChange={setTeamId} full />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" nativeButton disabled={pending}>
              {pending ? "Saving…" : email.trim() ? "Add and copy invite" : "Add to roster"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProfileDialog({
  member,
  teams,
  onOpenChange,
  onSave,
}: {
  member: StaffMember | null;
  teams: Team[];
  onOpenChange: (open: boolean) => void;
  onSave: (
    patch: Partial<Pick<StaffMember, "name" | "title" | "email" | "phone" | "teamId">>,
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name);
    setTitle(member.title);
    setEmail(member.email);
    setPhone(member.phone);
    setTeamId(member.teamId || NO_TEAM);
  }, [member]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!member) return;
    setPending(true);
    try {
      await onSave({
        name: name.trim(),
        title: title.trim(),
        email: email.trim(),
        phone: phone.trim(),
        teamId: parseTeamSelect(teamId),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Profile for {member?.name}</DialogTitle>
            <DialogDescription>
              Name, title, and phone print on estimates and invoices for jobs they own. Team controls
              who sees their book.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-name">Name</Label>
              <Input
                id="profile-edit-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-title">Title</Label>
              <Input
                id="profile-edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-phone">Phone</Label>
              <Input
                id="profile-edit-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(303) 555-0142"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-email">Email</Label>
              <Input
                id="profile-edit-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-team">Team</Label>
              <TeamSelect id="profile-edit-team" value={teamId} teams={teams} onChange={setTeamId} full />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" nativeButton disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
