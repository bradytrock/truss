"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Copy, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { CurrencyInput } from "@/components/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { BulkInviteDialog } from "@/components/bulk-invite-dialog";
import { EmptyState } from "@/components/page-chrome";
import { SettingsCard, SettingsPageHeader } from "@/components/settings-chrome";
import { TeamPeopleTabs } from "@/components/people-settings-chrome";
import { GoogleLocationSelect } from "@/components/google-locations-settings";
import { StaffPhotoField } from "@/components/staff-photo-field";
import { staffTeamLabel, TeamSelect } from "@/components/teams-settings";
import { requestInviteEmails } from "@/lib/invite-email";
import {
  defaultTitleForRole,
  INVITE_DAYS,
  inviteIsExpired,
  inviteIsPending,
  inviteSignupUrl,
  staffStatusLabel,
} from "@/lib/accounts";
import { PhoneInput } from "@/components/phone-input";
import { formatDate, formatPhone, initials } from "@/lib/format";
import { formatPhoneInput } from "@/lib/phone";
import { copyText } from "@/lib/share";
import { cardUrl } from "@/lib/card";
import { WebsiteChatSnippet } from "@/components/website-chat-snippet";
import { mintPersonCardSlug } from "@/lib/card-slug";
import { NO_TEAM, parseTeamSelect } from "@/lib/teams";
import type { GoogleLocation, SeatRole, StaffMember, Team } from "@/lib/types";
import { SEAT_ROLE_LABELS, SEAT_ROLES } from "@/lib/types";
import { isCompanyLeader } from "@/lib/visibility";
import { cn } from "@/lib/utils";

const ROLE_ITEMS = SEAT_ROLES.map((role) => ({
  value: role,
  label: SEAT_ROLE_LABELS[role],
}));

const ROLE_SUMMARIES = [
  {
    title: "Company admin",
    body: "Every job, contact, and report. Assigns and reassigns leads. Manages settings and billing.",
  },
  {
    title: "Project manager",
    body: "Their own leads and jobs. Can pass a lead back to admins, but can’t hand it to another rep.",
  },
  {
    title: "Business development",
    body: "Prospecting, referral partners, and lead intake. Sees the business-development book.",
  },
  {
    title: "Office / Production",
    body: "Accounting, team leads, and superintendents. Scheduling, paperwork, and production on the jobs they’re assigned.",
  },
];

const AVATAR_TONES = [
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-900",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
];

function avatarTone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
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
  companySlug,
  googleLocations,
  companySignature = "",
  onInvite,
  onInviteMany,
  onUpdate,
  onRefreshInvite,
  onRemove,
}: {
  teams: Team[];
  staff: StaffMember[];
  viewerId: string;
  companySlug: string;
  googleLocations: GoogleLocation[];
  /** Shown as the placeholder a blank signature falls back to. */
  companySignature?: string;
  onInvite: (input: {
    name: string;
    email: string;
    role: SeatRole;
    title?: string;
    phone?: string;
    teamId?: string | null;
  }) => Promise<{ member: StaffMember; inviteUrl: string | null } | null>;
  onInviteMany: (
    rows: Array<{
      name: string;
      email: string;
      role: SeatRole;
      title?: string;
      teamId?: string | null;
    }>,
  ) => Promise<Array<{ member: StaffMember; inviteUrl: string | null }>>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<StaffMember, "name" | "title" | "role" | "email" | "phone" | "emailSignature" | "locked" | "restricted" | "manageAutomations" | "teamId" | "cardSlug">>,
  ) => Promise<boolean>;
  onRefreshInvite: (id: string) => Promise<string | null>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmailedTo, setInviteEmailedTo] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [profileTarget, setProfileTarget] = useState<StaffMember | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<SeatRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "expired">("all");
  const people = useMemo(
    () =>
      [...staff].sort((left, right) => {
        if (left.id === viewerId) return -1;
        if (right.id === viewerId) return 1;
        return left.name.localeCompare(right.name);
      }),
    [staff, viewerId],
  );
  const counts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let expired = 0;
    for (const member of staff) {
      if (inviteIsPending(member) && inviteIsExpired(member)) expired += 1;
      else if (inviteIsPending(member) && !member.locked) pending += 1;
      else if (!member.locked) active += 1;
    }
    return { active, pending, expired };
  }, [staff]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((member) => {
      if (roleFilter !== "all" && member.role !== roleFilter) return false;
      const expired = inviteIsPending(member) && inviteIsExpired(member);
      const pending = inviteIsPending(member) && !expired;
      if (statusFilter === "expired" && !expired) return false;
      if (statusFilter === "pending" && !pending) return false;
      if (statusFilter === "active" && (expired || pending || member.locked)) return false;
      if (!needle) return true;
      return `${member.name} ${member.title} ${member.email} ${member.phone}`.toLowerCase().includes(needle);
    });
  }, [people, query, roleFilter, statusFilter]);

  async function resendExpired() {
    const expired = staff.filter((member) => inviteIsPending(member) && inviteIsExpired(member));
    for (const member of expired) {
      await onRefreshInvite(member.id);
    }
    const emailed = await requestInviteEmails(expired.map((member) => member.id));
    const sent = emailed.results.filter((row) => row.ok).length;
    if (sent > 0) toast.success(`Resent ${sent} invite${sent === 1 ? "" : "s"}.`);
    else toast.error(emailed.error || "Could not resend those invites.");
  }

  async function showInvite(url: string | null, name: string, emailedTo?: string | null) {
    if (!url) return;
    setInviteName(name);
    setInviteEmailedTo(emailedTo ?? null);
    setInviteUrl(url);
    if (!emailedTo) await copyInvite(url);
  }

  async function emailSeatInvite(member: StaffMember) {
    const tokenReady = Boolean(member.inviteToken) && !inviteIsExpired(member);
    if (!tokenReady) {
      const url = await onRefreshInvite(member.id);
      if (!url) return;
    }
    const emailed = await requestInviteEmails([member.id]);
    const row = emailed.results.find((item) => item.staffId === member.id);
    if (emailed.ok || row?.ok) {
      toast.success(`Invite emailed to ${row?.email || member.email}. It works once.`);
      return;
    }
    toast.error(emailed.error || row?.error || "Could not email that invite.");
    const url = member.inviteToken
      ? inviteSignupUrl(window.location.origin, member.inviteToken)
      : await onRefreshInvite(member.id);
    await showInvite(url, member.name);
  }

  async function copyCard(member: StaffMember) {
    if (!companySlug) {
      toast.error("Set a company card URL under Settings → Company first.");
      return;
    }
    if (member.locked) {
      toast.error("Locked seats do not have a live card.");
      return;
    }
    let personSlug = member.cardSlug.trim();
    if (!personSlug) {
      personSlug = mintPersonCardSlug(
        member.name,
        "",
        staff.filter((item) => item.id !== member.id).map((item) => item.cardSlug),
      );
      const ok = await onUpdate(member.id, { cardSlug: personSlug });
      if (!ok) return;
    }
    const url = cardUrl(companySlug, personSlug, window.location.origin);
    const ok = await copyText(url);
    if (ok) toast.success("Card link copied.");
    else toast.error("Could not copy the link. Select it and copy it yourself.");
  }

  function menuFor(member: StaffMember, full?: boolean) {
    return (
      <SeatMenu
        member={member}
        isSelf={member.id === viewerId}
        onEditProfile={() => setProfileTarget(member)}
        onUpdate={onUpdate}
        onCopyCard={() => void copyCard(member)}
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
        onEmailInvite={() => void emailSeatInvite(member)}
        onRemove={() => setRemoveTarget(member)}
        full={full}
      />
    );
  }

  return (
    <>
      <SettingsPageHeader
        eyebrow="Team"
        title="People"
        description={`Everyone with a seat in this company. Invite links join this company, work once, and expire after ${INVITE_DAYS} days.`}
        actions={
          <>
            <Button type="button" variant="outline" className="rounded-lg bg-white" onClick={() => setBulkOpen(true)}>
              Bulk add
            </Button>
            <Button type="button" className="rounded-lg" onClick={() => setAddOpen(true)}>
              <Plus />
              Add teammate
            </Button>
          </>
        }
      />
      <TeamPeopleTabs />

      {counts.expired > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-600" />
            {counts.expired} invite{counts.expired === 1 ? " has" : "s have"} expired. Those teammates can’t sign in until they get a fresh link.
          </p>
          <Button type="button" size="sm" onClick={() => void resendExpired()}>
            Resend all {counts.expired}
          </Button>
        </div>
      ) : null}

      <SettingsCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#f0ece8] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", `All ${staff.length}`],
                ["active", `Active ${counts.active}`],
                ["pending", `Pending ${counts.pending}`],
                ["expired", `Expired ${counts.expired}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm",
                  statusFilter === id ? "bg-neutral-950 text-white" : "bg-[#f3f1ee] text-foreground/80 hover:bg-[#ebe7e2]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e6e1db] bg-white px-3 py-1.5 sm:max-w-xs sm:ml-auto">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, title, email"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <Select
            value={roleFilter}
            onValueChange={(value) => setRoleFilter((value as SeatRole | "all") ?? "all")}
            items={[{ value: "all", label: "All roles" }, ...ROLE_ITEMS]}
          >
            <SelectTrigger className="w-full rounded-lg bg-white sm:w-44">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {people.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No seats yet"
              description="Add the people who run jobs, estimates, and the office. An email sends a one-time signup link; skip it to assign work before they have a login."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setBulkOpen(true)}>
                    Bulk add
                  </Button>
                  <Button type="button" onClick={() => setAddOpen(true)}>
                    Add teammate
                  </Button>
                </div>
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">No people match that filter.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 text-[11px] tracking-wide text-muted-foreground uppercase">Person</TableHead>
                    <TableHead className="text-[11px] tracking-wide text-muted-foreground uppercase">Contact</TableHead>
                    <TableHead className="text-[11px] tracking-wide text-muted-foreground uppercase">Role</TableHead>
                    <TableHead className="text-[11px] tracking-wide text-muted-foreground uppercase">Team</TableHead>
                    <TableHead className="text-[11px] tracking-wide text-muted-foreground uppercase">Status</TableHead>
                    <TableHead className="w-12 pr-4 text-right">
                      <span className="sr-only">Account</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((member) => (
                    <TableRow key={member.id} className="cursor-pointer" onClick={() => setProfileTarget(member)}>
                      <TableCell className="pl-4 whitespace-normal">
                        <div className="flex items-center gap-2.5">
                          <SeatAvatar member={member} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {member.name}
                              {member.id === viewerId ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>
                              ) : null}
                            </p>
                            {member.title ? (
                              <p className="truncate text-xs text-muted-foreground">{member.title}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal text-sm text-muted-foreground">
                        <p className="truncate">{member.email || "No email"}</p>
                        {member.phone ? <p className="truncate">{formatPhone(member.phone)}</p> : null}
                      </TableCell>
                      <TableCell>
                        <RolePill role={member.role} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{staffTeamLabel(teams, member)}</TableCell>
                      <TableCell>
                        <StatusBadge member={member} you={member.id === viewerId} />
                      </TableCell>
                      <TableCell className="pr-4 text-right" onClick={(event) => event.stopPropagation()}>
                        {menuFor(member)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="grid gap-3 p-3 md:hidden">
              {visible.map((member) => (
                <li key={member.id} className="rounded-xl border border-[#eeeae6] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="flex min-w-0 items-start gap-2.5 text-left" onClick={() => setProfileTarget(member)}>
                      <SeatAvatar member={member} />
                      <span className="min-w-0">
                        <span className="block font-medium">{member.name}</span>
                        <span className="block text-xs text-muted-foreground">{member.title}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">{member.email || "No email"}</span>
                      </span>
                    </button>
                    <StatusBadge member={member} you={member.id === viewerId} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {SEAT_ROLE_LABELS[member.role]} · {staffTeamLabel(teams, member)}
                  </p>
                  <div className="mt-2">{menuFor(member, true)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="border-t border-[#f0ece8] px-4 py-2.5 text-xs text-muted-foreground">
          Showing {visible.length} of {people.length} people
          <span className="hidden sm:inline"> · Select a name to edit their profile, card, and signature.</span>
        </p>
      </SettingsCard>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">What each role can do</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLE_SUMMARIES.map((role) => (
            <div key={role.title} className="rounded-2xl border border-[#ebe7e2] bg-white p-4">
              <p className="text-sm font-medium">{role.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{role.body}</p>
            </div>
          ))}
        </div>
      </div>

      <AddTeammateDialog
        open={addOpen}
        teams={teams}
        onOpenChange={setAddOpen}
        onInvite={async (input) => {
          const result = await onInvite(input);
          if (!result) return false;
          setAddOpen(false);
          if (result.member.email && result.inviteUrl) {
            const emailed = await requestInviteEmails([result.member.id]);
            const row = emailed.results.find((item) => item.staffId === result.member.id);
            if (emailed.ok || row?.ok) {
              toast.success(`Invite emailed to ${result.member.email}. It works once.`);
              await showInvite(result.inviteUrl, result.member.name, result.member.email);
              return true;
            }
            toast.error(emailed.error || row?.error || "Invite saved. Copy the link to send it.");
          }
          await showInvite(result.inviteUrl, result.member.name);
          return true;
        }}
      />

      <BulkInviteDialog
        open={bulkOpen}
        teams={teams}
        existingEmails={staff.map((member) => member.email)}
        onOpenChange={setBulkOpen}
        onInviteMany={onInviteMany}
      />

      <Dialog
        open={Boolean(inviteUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setInviteUrl(null);
            setInviteEmailedTo(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite {inviteName}</DialogTitle>
            <DialogDescription>
              {inviteEmailedTo
                ? `We emailed a one-time setup link to ${inviteEmailedTo}. After they set a password, this link cannot be reused.`
                : "They sign up with this one-time link and join this company. Copy it into a text or email if you still need to send it."}
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
        companySlug={companySlug}
        teams={teams}
        googleLocations={googleLocations}
        companySignature={companySignature}
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

function SeatAvatar({ member }: { member: StaffMember }) {
  const photo = member.photoUrl?.trim() ?? "";
  return (
    <Avatar className="size-9">
      {photo ? <AvatarImage src={photo} alt="" /> : null}
      <AvatarFallback className={cn("text-[11px] font-medium", avatarTone(member.name))}>
        {initials(member.name) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

function RolePill({ role }: { role: SeatRole }) {
  const dark = role === "company_admin";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        dark && "bg-neutral-950 text-white",
        role === "project_manager" && "bg-sky-100 text-sky-900",
        role === "business_development" && "bg-violet-100 text-violet-900",
        role === "accountant" && "bg-amber-100 text-amber-950",
        !dark &&
          role !== "project_manager" &&
          role !== "business_development" &&
          role !== "accountant" &&
          "bg-[#f3f1ee] text-foreground/80",
      )}
    >
      {SEAT_ROLE_LABELS[role]}
    </span>
  );
}

function StatusBadge({ member, you }: { member: StaffMember; you?: boolean }) {
  const label = staffStatusLabel(member);
  const pending = label === "Invited";
  const expired = label === "Invite expired";
  const locked = label === "Locked" || label === "Restricted";
  const hint =
    inviteIsPending(member) && member.inviteExpiresAt
      ? expired
        ? `Expired ${formatDate(member.inviteExpiresAt)}`
        : `Expires ${formatDate(member.inviteExpiresAt)}`
      : you
        ? "Signed in now"
        : null;
  const text = pending ? "Invite pending" : label;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span
          className={cn(
            "size-1.5 rounded-full",
            expired || locked ? "bg-rose-500" : pending ? "bg-amber-500" : "bg-emerald-500",
          )}
        />
        {text}
      </span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function RoleSelect({
  id,
  value,
  onChange,
  full,
}: {
  id?: string;
  value: SeatRole;
  onChange: (role: SeatRole) => void;
  full?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(String(next ?? value) as SeatRole)}
      items={ROLE_ITEMS}
    >
      <SelectTrigger id={id} className={full ? "w-full" : "w-44"} size={full ? "default" : "sm"}>
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
  onCopyCard,
  onRefreshInvite,
  onCopyInvite,
  onEmailInvite,
  onRemove,
  full,
}: {
  member: StaffMember;
  isSelf: boolean;
  onEditProfile: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<StaffMember, "locked" | "restricted" | "manageAutomations">>,
  ) => Promise<boolean>;
  onCopyCard: () => void;
  onRefreshInvite: () => Promise<void>;
  onCopyInvite: () => Promise<void>;
  onEmailInvite: () => Promise<void> | void;
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
        <DropdownMenuItem disabled={member.locked} onClick={onCopyCard}>
          Copy card link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canInvite} onClick={() => void onEmailInvite()}>
          Email invite
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canInvite} onClick={() => void onCopyInvite()}>
          Copy invite link
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canInvite} onClick={() => void onRefreshInvite()}>
          {inviteIsPending(member) ? "Refresh invite" : "Create invite"}
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
        {isCompanyLeader(member.role) ? null : (
          <DropdownMenuItem
            onClick={() => void onUpdate(member.id, { manageAutomations: !member.manageAutomations })}
          >
            {member.manageAutomations ? "Revoke automations" : "Allow automations"}
          </DropdownMenuItem>
        )}
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
              An email sends a one-time setup link into this company. Leave it blank to add a seat you
              can assign work to before they have a login.
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
              <PhoneInput
                id="seat-phone"
                value={phone}
                onValueChange={setPhone}
                placeholder="(214) 555-0142"
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
              {pending ? "Saving…" : email.trim() ? "Add and email invite" : "Add to roster"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ProfilePatch = Partial<
  Pick<
    StaffMember,
    | "name"
    | "title"
    | "email"
    | "phone"
    | "role"
    | "teamId"
    | "cardSlug"
    | "googleLocationId"
    | "emailSignature"
    | "monthlySalesQuota"
  >
>;

function EditProfileDialog({
  member,
  companySlug,
  teams,
  googleLocations,
  companySignature,
  onOpenChange,
  onSave,
}: {
  member: StaffMember | null;
  companySlug: string;
  teams: Team[];
  googleLocations: GoogleLocation[];
  companySignature: string;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: ProfilePatch) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cardSlug, setCardSlug] = useState("");
  const [role, setRole] = useState<SeatRole>("project_manager");
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [quota, setQuota] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name);
    setTitle(member.title);
    setEmail(member.email);
    setPhone(formatPhoneInput(member.phone));
    setCardSlug(member.cardSlug);
    setRole(member.role);
    setTeamId(member.teamId || NO_TEAM);
    setLocationId(member.googleLocationId ?? null);
    setSignature(member.emailSignature ?? "");
    setQuota(
      member.monthlySalesQuota == null ? "" : String(member.monthlySalesQuota),
    );
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
        cardSlug: cardSlug.trim(),
        role,
        teamId: parseTeamSelect(teamId),
        googleLocationId: locationId,
        emailSignature: signature,
        monthlySalesQuota: quota.trim() === "" ? null : Math.max(0, Number(quota) || 0),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Profile for {member?.name}</DialogTitle>
            <DialogDescription>
              Everything about this person lives here. Name, title, and phone print on estimates and
              invoices for jobs they own. Team controls who sees their book.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {member ? (
              <div className="grid gap-1.5">
                <Label>Card photo</Label>
                <StaffPhotoField
                  member={member}
                  description={`Tops ${member.name.split(" ")[0] || "their"}’s digital card. Saves as soon as you pick it.`}
                />
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-edit-phone">Phone</Label>
                <PhoneInput
                  id="profile-edit-phone"
                  value={phone}
                  onValueChange={setPhone}
                  placeholder="(214) 555-0142"
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-edit-role">Role</Label>
                <RoleSelect id="profile-edit-role" value={role} onChange={setRole} full />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="profile-edit-team">Team</Label>
                <TeamSelect id="profile-edit-team" value={teamId} teams={teams} onChange={setTeamId} full />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-card">Card URL</Label>
              <Input
                id="profile-edit-card"
                value={cardSlug}
                onChange={(event) => setCardSlug(event.target.value)}
                placeholder="jordan.hale"
              />
              <p className="text-xs text-muted-foreground">
                first.last. Changing this breaks NFC and QR that already use the old link.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-location">Google location</Label>
              <GoogleLocationSelect
                id="profile-edit-location"
                value={locationId}
                locations={googleLocations}
                onChange={setLocationId}
                full
              />
              <p className="text-xs text-muted-foreground">
                {googleLocations.length === 0
                  ? "No locations yet. Add one under Settings → Locations to turn on the review button."
                  : "Which listing the review button on their card opens. Manage the list under Settings → Locations."}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-quota">Monthly sales quota</Label>
              <CurrencyInput
                id="profile-edit-quota"
                value={quota}
                onValueChange={setQuota}
                placeholder="Company default"
              />
              <p className="text-xs text-muted-foreground">
                {quota.trim()
                  ? "Overrides the company default on the home Goal bar."
                  : "Blank inherits the company default from Settings → Company."}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-edit-signature">Email signature</Label>
              <Textarea
                id="profile-edit-signature"
                rows={4}
                className="field-sizing-fixed min-h-24 resize-y"
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder={companySignature || "Best,\nJordan Hale"}
              />
              <p className="text-xs text-muted-foreground">
                {signature.trim()
                  ? "Signs off mail they send from Inbox."
                  : "Blank uses the company default from Settings → Company."}
              </p>
            </div>
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">Their website chat</p>
              <p className="text-xs text-muted-foreground">
                {member?.locked
                  ? "This seat is locked, so this header code will not open leads."
                  : "Paste this in the header of a site they run. New conversations open a lead in their pipeline and notify only them."}
              </p>
              {member ? (
                <WebsiteChatSnippet
                  company={companySlug}
                  personId={member.id}
                  fieldId="person-chat-snippet"
                />
              ) : null}
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
