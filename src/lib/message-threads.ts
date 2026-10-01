import { looksLikePhone } from "@/lib/phone";
import {
  conversationThreadKey,
  jobForContact,
  messageConversationKey,
  opportunityForContact,
  phoneKey,
  type MessageThread,
} from "@/lib/job-messages";
import { namesMatch } from "@/lib/seats";
import type {
  CompanyProfile,
  Contact,
  Job,
  MessageThreadMember,
  MessageThreadOpen,
  Opportunity,
  SeatRole,
  StaffMember,
  TextMessage,
  ThreadViewer,
} from "@/lib/types";

export function isMessageCompanyAdmin(viewer: ThreadViewer) {
  return viewer.role === "company_admin" || viewer.profileRole === "company_admin";
}

export function isMessageTeamLead(viewer: ThreadViewer) {
  return viewer.role === "team_lead" || viewer.role === "team_admin";
}

export function viewerFromStaff(
  staff: StaffMember,
  profiles: CompanyProfile[],
  extras?: { profileId?: string; profileRole?: SeatRole | null },
): ThreadViewer {
  const profile =
    (extras?.profileId
      ? profiles.find((row) => row.id === extras.profileId)
      : undefined) ??
    profiles.find((row) => row.staffId && row.staffId === staff.id) ??
    profiles.find((row) => namesMatch(row.name, staff.name));
  return {
    profileId: extras?.profileId || profile?.id || staff.id,
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    profileRole: extras?.profileRole ?? profile?.role ?? null,
    teamId: staff.teamId,
  };
}

export function seatsAsProfiles(staff: StaffMember[], profiles: CompanyProfile[]) {
  if (profiles.length > 0) return profiles;
  return staff.map((member) => ({
    id: member.id,
    staffId: member.id,
    name: member.name,
    title: member.title,
    role: member.role,
  }));
}

export function relatedContactIdsForThread(threadKey: string, contacts: Contact[]) {
  if (threadKey.startsWith("p:")) {
    const last10 = threadKey.slice(2);
    return contacts.filter((contact) => phoneKey(contact.phone) === last10).map((contact) => contact.id);
  }
  if (threadKey.startsWith("c:")) return [threadKey.slice(2)];
  const contact = contacts.find((row) => row.id === threadKey);
  return contact ? [contact.id] : [];
}

function idEquals(value: string | null | undefined, person: ThreadViewer) {
  if (!value) return false;
  const needle = value.trim().toLowerCase();
  if (!needle) return false;
  return needle === person.profileId.toLowerCase() || needle === person.staffId.toLowerCase();
}

function staffIdEquals(value: string | null | undefined, person: ThreadViewer) {
  if (!value) return false;
  return value === person.staffId;
}

export function personOnProject(
  person: ThreadViewer,
  job: Job | undefined,
  opportunity: Opportunity | undefined,
) {
  if (opportunity) {
    if (idEquals(opportunity.createdBy, person)) return true;
    if (idEquals(opportunity.assignedTo, person)) return true;
    if (staffIdEquals(opportunity.ownerStaffId, person)) return true;
    if (staffIdEquals(opportunity.originatorStaffId, person)) return true;
    if (opportunity.estimator && namesMatch(opportunity.estimator, person.name)) return true;
  }
  if (job) {
    if (staffIdEquals(job.ownerStaffId, person)) return true;
    if (job.projectManager && namesMatch(job.projectManager, person.name)) return true;
    if (job.superintendent && namesMatch(job.superintendent, person.name)) return true;
  }
  return false;
}

export function projectTouchesHomeowner(
  job: Job,
  opportunity: Opportunity | undefined,
  contactIds: Set<string>,
) {
  if (job.primaryContactId && contactIds.has(job.primaryContactId)) return true;
  if (job.relatedContactIds.some((id) => contactIds.has(id))) return true;
  if (opportunity?.primaryContactId && contactIds.has(opportunity.primaryContactId)) return true;
  return Boolean(opportunity && job.opportunityId === opportunity.id && opportunity.primaryContactId && contactIds.has(opportunity.primaryContactId));
}

export function homeownerProjects(
  contactIds: string[],
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const ids = new Set(contactIds);
  const linked: Array<{ job?: Job; opportunity?: Opportunity }> = [];
  const seen = new Set<string>();
  for (const job of jobs) {
    const opportunity = job.opportunityId
      ? opportunities.find((item) => item.id === job.opportunityId)
      : undefined;
    if (!projectTouchesHomeowner(job, opportunity, ids)) continue;
    const key = `job:${job.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    linked.push({ job, opportunity });
  }
  for (const opportunity of opportunities) {
    if (!opportunity.primaryContactId || !ids.has(opportunity.primaryContactId)) continue;
    const key = `opp:${opportunity.id}`;
    if (seen.has(key)) continue;
    if (jobs.some((job) => job.opportunityId === opportunity.id && seen.has(`job:${job.id}`))) {
      continue;
    }
    seen.add(key);
    linked.push({ opportunity });
  }
  return linked;
}

export function threadHasSender(thread: Pick<MessageThread, "messages">, person: ThreadViewer) {
  return thread.messages.some((message) => {
    const created = message.createdBy.trim();
    if (!created) return false;
    if (idEquals(created, person)) return true;
    return namesMatch(created, person.name);
  });
}

export function explicitlyAdded(
  threadKey: string,
  profileId: string,
  members: MessageThreadMember[],
) {
  return members.some((row) => row.threadKey === threadKey && row.profileId === profileId);
}

export function viewerOnHomeownerProject(
  thread: Pick<MessageThread, "contactIds" | "contactId">,
  person: ThreadViewer,
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const contactIds = thread.contactIds.length > 0 ? thread.contactIds : thread.contactId ? [thread.contactId] : [];
  return homeownerProjects(contactIds, jobs, opportunities).some((project) =>
    personOnProject(person, project.job, project.opportunity),
  );
}

export function canSeeMessageThread(
  thread: MessageThread,
  viewer: ThreadViewer,
  opts: {
    staff: StaffMember[];
    profiles: CompanyProfile[];
    members: MessageThreadMember[];
    jobs: Job[];
    opportunities: Opportunity[];
  },
) {
  if (isMessageCompanyAdmin(viewer)) return true;
  if (explicitlyAdded(thread.key, viewer.profileId, opts.members)) return true;
  if (threadHasSender(thread, viewer)) return true;
  if (viewerOnHomeownerProject(thread, viewer, opts.jobs, opts.opportunities)) return true;
  if (!isMessageTeamLead(viewer) || !viewer.teamId) return false;
  const roster = opts.staff.filter((member) => member.teamId === viewer.teamId && member.id !== viewer.staffId);
  return roster.some((member) => {
    const person = viewerFromStaff(member, opts.profiles);
    if (explicitlyAdded(thread.key, person.profileId, opts.members)) return true;
    if (threadHasSender(thread, person)) return true;
    return viewerOnHomeownerProject(thread, person, opts.jobs, opts.opportunities);
  });
}

export function visibleInboxThreads(
  threads: MessageThread[],
  viewer: ThreadViewer,
  opts: {
    staff: StaffMember[];
    profiles: CompanyProfile[];
    members: MessageThreadMember[];
    jobs: Job[];
    opportunities: Opportunity[];
  },
) {
  return threads.filter((thread) => canSeeMessageThread(thread, viewer, opts));
}

export function openedAtFor(
  opens: MessageThreadOpen[],
  profileId: string,
  threadKey: string,
) {
  return opens.find((row) => row.profileId === profileId && row.threadKey === threadKey)?.openedAt ?? null;
}

export function threadUnreadCount(thread: MessageThread, openedAt: string | null | undefined) {
  const last = thread.messages[thread.messages.length - 1];
  if (!last || last.direction !== "inbound") return 0;
  if (openedAt && last.createdAt <= openedAt) return 0;
  return thread.messages.filter(
    (message) => message.direction === "inbound" && (!openedAt || message.createdAt > openedAt),
  ).length;
}

export function threadIsUnread(thread: MessageThread, openedAt: string | null | undefined) {
  return threadUnreadCount(thread, openedAt) > 0;
}

export function implicitThreadCrew(
  thread: Pick<MessageThread, "contactIds" | "contactId">,
  staff: StaffMember[],
  profiles: CompanyProfile[],
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const people = seatsAsProfiles(staff, profiles);
  const contactIds = thread.contactIds.length > 0 ? thread.contactIds : thread.contactId ? [thread.contactId] : [];
  const projects = homeownerProjects(contactIds, jobs, opportunities);
  return people.filter((profile) => {
    const member = staff.find((row) => row.id === profile.staffId) ?? staff.find((row) => namesMatch(row.name, profile.name));
    const person: ThreadViewer = {
      profileId: profile.id,
      staffId: member?.id ?? profile.staffId ?? profile.id,
      name: profile.name,
      role: member?.role ?? profile.role,
      profileRole: profile.role,
      teamId: member?.teamId ?? null,
    };
    return projects.some((project) => personOnProject(person, project.job, project.opportunity));
  });
}

export function addableThreadPeople(
  thread: Pick<MessageThread, "key" | "contactIds" | "contactId">,
  staff: StaffMember[],
  profiles: CompanyProfile[],
  members: MessageThreadMember[],
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const crewIds = new Set(implicitThreadCrew(thread, staff, profiles, jobs, opportunities).map((row) => row.id));
  const addedIds = new Set(
    members.filter((row) => row.threadKey === thread.key).map((row) => row.profileId),
  );
  return seatsAsProfiles(staff, profiles).filter(
    (profile) => !crewIds.has(profile.id) && !addedIds.has(profile.id),
  );
}

export function addedThreadPeople(
  threadKey: string,
  profiles: CompanyProfile[],
  members: MessageThreadMember[],
) {
  return members
    .filter((row) => row.threadKey === threadKey)
    .map((row) => {
      const profile = profiles.find((item) => item.id === row.profileId);
      return {
        member: row,
        profile: profile ?? {
          id: row.profileId,
          staffId: null,
          name: "Teammate",
          title: "",
          role: "project_manager" as SeatRole,
        },
      };
    });
}

export function threadKeyForContact(contact: Pick<Contact, "id" | "phone">) {
  return conversationThreadKey({ contactId: contact.id, phone: contact.phone });
}

export function messageBelongsToThread(
  message: Pick<TextMessage, "contactId" | "phone" | "fromNumber" | "toNumber">,
  threadKey: string,
  contacts: Contact[],
) {
  if (messageConversationKey(message, contacts) === threadKey) return true;
  const related = new Set(relatedContactIdsForThread(threadKey, contacts));
  if (message.contactId && related.has(message.contactId)) return true;
  if (threadKey.startsWith("p:")) {
    const last10 = threadKey.slice(2);
    return [message.phone, message.fromNumber, message.toNumber].some((value) => {
      if (!value) return false;
      return phoneKey(value) === last10 || value.includes(last10);
    });
  }
  return false;
}

export function hasRealContactName(contact: Contact | undefined) {
  const name = contact?.name.trim() ?? "";
  if (!name) return false;
  return !looksLikePhone(name);
}

export function jobForThreadContacts(
  jobs: Job[],
  opportunities: Opportunity[],
  contactIds: string[],
) {
  for (const contactId of contactIds) {
    const job = jobForContact(jobs, opportunities, contactId);
    if (job) return job;
  }
  return undefined;
}

export function opportunityForThreadContacts(opportunities: Opportunity[], contactIds: string[]) {
  for (const contactId of contactIds) {
    const opportunity = opportunityForContact(opportunities, contactId);
    if (opportunity) return opportunity;
  }
  return undefined;
}
