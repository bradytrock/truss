import assert from "node:assert/strict";
import {
  conversationThreadKey,
  messageThreads,
  resolveInboxThreadKey,
} from "./job-messages.ts";
import {
  addableThreadPeople,
  canSeeMessageThread,
  implicitThreadCrew,
  threadIsUnread,
  threadUnreadCount,
  viewerFromStaff,
  visibleInboxThreads,
} from "./message-threads.ts";
import type {
  CompanyProfile,
  Contact,
  Job,
  MessageThreadMember,
  Opportunity,
  StaffMember,
  TextMessage,
} from "./types.ts";

function contact(id: string, name: string, phone: string): Contact {
  return {
    id,
    clientId: null,
    name,
    title: "",
    email: "",
    phone,
    ownerStaffId: "",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
  };
}

function staff(partial: Partial<StaffMember> & Pick<StaffMember, "id" | "name" | "role">): StaffMember {
  return {
    title: partial.role,
    teamId: null,
    initials: "XX",
    email: "",
    phone: "",
    emailSignature: "",
    cardSlug: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
    ...partial,
  };
}

function job(partial: Partial<Job> & Pick<Job, "id" | "primaryContactId" | "ownerStaffId">): Job {
  return {
    code: "",
    opportunityId: null,
    name: "Roof",
    clientId: null,
    status: "in_progress",
    contractValue: 0,
    startDate: "2026-01-01",
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
    location: "",
    description: "",
    tags: [],
    street: "",
    city: "",
    state: "",
    postalCode: "",
    salesRep: "",
    assigned: [],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "",
    leadSource: "",
    deletedAt: null,
    deletedReason: "",
    ...partial,
  } as Job;
}

function opportunity(
  partial: Partial<Opportunity> & Pick<Opportunity, "id" | "primaryContactId" | "ownerStaffId">,
): Opportunity {
  return {
    code: "",
    name: "Lead",
    clientId: null,
    stage: "pursuing",
    value: 0,
    bidDueAt: null,
    preBidWalkAt: null,
    location: "",
    projectType: "roofing",
    deliveryMethod: "insurance",
    estimator: "",
    winProbability: 0,
    nextStep: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  } as Opportunity;
}

function text(partial: Partial<TextMessage> & Pick<TextMessage, "id" | "direction" | "createdAt">): TextMessage {
  return {
    contactId: null,
    jobId: null,
    opportunityId: null,
    phone: "",
    body: "hi",
    handle: "",
    status: "sent",
    mediaUrl: "",
    createdBy: "",
    ...partial,
  };
}

const dana = contact("con_dana", "Dana Alvarez", "(555) 123-4567");
const danaDup = contact("con_dana_2", "", "+15551234567");
const noPhone = contact("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Mail Only", "");
const other = contact("con_other", "Other Homeowner", "(555) 000-1111");

const admin = staff({ id: "staff_admin", name: "Jordan Hale", role: "company_admin" });
const lead = staff({ id: "staff_lead", name: "Team Lead", role: "team_lead", teamId: "team_a" });
const rosterPm = staff({
  id: "staff_maya",
  name: "Maya Chen",
  role: "project_manager",
  teamId: "team_a",
});
const otherPm = staff({ id: "staff_other", name: "Other PM", role: "project_manager", teamId: "team_b" });
const accountant = staff({ id: "staff_acct", name: "Books", role: "accountant" });

const profiles: CompanyProfile[] = [
  { id: "prof_admin", staffId: "staff_admin", name: "Jordan Hale", title: "Admin", role: "company_admin" },
  { id: "prof_lead", staffId: "staff_lead", name: "Team Lead", title: "Lead", role: "team_lead" },
  { id: "prof_maya", staffId: "staff_maya", name: "Maya Chen", title: "PM", role: "project_manager" },
  { id: "prof_other", staffId: "staff_other", name: "Other PM", title: "PM", role: "project_manager" },
  { id: "prof_acct", staffId: "staff_acct", name: "Books", title: "Accountant", role: "accountant" },
];

const danaJob = job({
  id: "job_dana",
  primaryContactId: "con_dana",
  ownerStaffId: "staff_maya",
  projectManager: "Maya Chen",
  opportunityId: "opp_dana",
});
const danaOpp = opportunity({
  id: "opp_dana",
  primaryContactId: "con_dana",
  ownerStaffId: "staff_maya",
  assignedTo: "prof_maya",
  createdBy: "prof_maya",
});
const otherJob = job({
  id: "job_other",
  primaryContactId: "con_other",
  ownerStaffId: "staff_other",
});

const inbound = text({
  id: "m1",
  contactId: "con_dana_2",
  direction: "inbound",
  phone: "+1 (555) 123-4567",
  fromNumber: "+15551234567",
  body: "Hello",
  createdAt: "2026-09-24T12:00:00.000Z",
});
const outbound = text({
  id: "m2",
  contactId: "con_dana",
  jobId: "job_dana",
  direction: "outbound",
  phone: "5551234567",
  toNumber: "555-123-4567",
  body: "On our way",
  createdAt: "2026-09-24T12:05:00.000Z",
  createdBy: "Maya Chen",
});
const otherMsg = text({
  id: "m3",
  contactId: "con_other",
  jobId: "job_other",
  direction: "inbound",
  phone: "(555) 000-1111",
  body: "Other",
  createdAt: "2026-09-24T13:00:00.000Z",
});

assert.equal(conversationThreadKey({ phone: "(555) 123-4567" }), "p:5551234567");
assert.equal(conversationThreadKey({ phone: "+1 (555) 123-4567" }), "p:5551234567");
assert.equal(
  conversationThreadKey({ contactId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }),
  "c:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
);
assert.equal(resolveInboxThreadKey("5551234567", [dana]), "p:5551234567");
assert.equal(resolveInboxThreadKey("con_dana", [dana]), "p:5551234567");
assert.equal(resolveInboxThreadKey("c:AAAAAAAA-aaaa-4aaa-8aaa-aaaaaaaaaaaa", []), "c:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

const threads = messageThreads(
  [inbound, outbound, otherMsg],
  [dana, danaDup, noPhone, other],
  [danaJob, otherJob],
  [danaOpp],
);
assert.equal(threads.length, 2);
const danaThread = threads.find((row) => row.key === "p:5551234567");
assert.ok(danaThread);
assert.equal(danaThread.messages.length, 2);
assert.equal(danaThread.title, "Dana Alvarez");
assert.ok(danaThread.contactIds.includes("con_dana"));
assert.ok(danaThread.contactIds.includes("con_dana_2"));

const lastInbound = {
  ...danaThread,
  messages: [
    outbound,
    text({
      id: "m4",
      contactId: "con_dana",
      direction: "inbound",
      phone: "5551234567",
      body: "Thanks",
      createdAt: "2026-09-24T14:00:00.000Z",
    }),
  ],
};
assert.equal(threadIsUnread(lastInbound, null), true);
assert.equal(threadUnreadCount(lastInbound, null), 1);
assert.equal(threadIsUnread(lastInbound, "2026-09-24T13:59:00.000Z"), true);
assert.equal(threadIsUnread(lastInbound, "2026-09-24T14:00:00.000Z"), false);
assert.equal(threadIsUnread(danaThread, null), false);

const roster = [admin, lead, rosterPm, otherPm, accountant];
const jobs = [danaJob, otherJob];
const opps = [danaOpp];
const members: MessageThreadMember[] = [];

const maya = viewerFromStaff(rosterPm, profiles);
assert.equal(canSeeMessageThread(danaThread, maya, { staff: roster, profiles, members, jobs, opportunities: opps }), true);

const otherViewer = viewerFromStaff(otherPm, profiles);
assert.equal(
  canSeeMessageThread(danaThread, otherViewer, { staff: roster, profiles, members, jobs, opportunities: opps }),
  false,
);

const acct = viewerFromStaff(accountant, profiles);
assert.equal(isAdminLike(acct) === false, true);
assert.equal(
  canSeeMessageThread(danaThread, acct, { staff: roster, profiles, members, jobs, opportunities: opps }),
  false,
);

const adminViewer = viewerFromStaff(admin, profiles);
assert.equal(
  canSeeMessageThread(danaThread, adminViewer, { staff: roster, profiles, members, jobs, opportunities: opps }),
  true,
);

const leadViewer = viewerFromStaff(lead, profiles);
assert.equal(
  canSeeMessageThread(danaThread, leadViewer, { staff: roster, profiles, members, jobs, opportunities: opps }),
  true,
);

const added: MessageThreadMember[] = [
  {
    id: "mem1",
    companyId: "co",
    threadKey: "p:5551234567",
    profileId: "prof_other",
    addedBy: "prof_maya",
  },
];
assert.equal(
  canSeeMessageThread(danaThread, otherViewer, {
    staff: roster,
    profiles,
    members: added,
    jobs,
    opportunities: opps,
  }),
  true,
);

const sentOnly = messageThreads(
  [
    text({
      id: "s1",
      contactId: "con_other",
      direction: "outbound",
      phone: "(555) 000-1111",
      createdAt: "2026-09-24T15:00:00.000Z",
      createdBy: "prof_acct",
    }),
  ],
  [other],
  [otherJob],
  [],
)[0];
assert.equal(
  canSeeMessageThread(sentOnly, acct, { staff: roster, profiles, members, jobs: [otherJob], opportunities: [] }),
  true,
);

const visibleForMaya = visibleInboxThreads(threads, maya, {
  staff: roster,
  profiles,
  members,
  jobs,
  opportunities: opps,
});
assert.equal(visibleForMaya.some((row) => row.key === "p:5551234567"), true);
assert.equal(visibleForMaya.some((row) => row.key === "p:5550001111"), false);

const crew = implicitThreadCrew(danaThread, roster, profiles, jobs, opps);
assert.ok(crew.some((row) => row.id === "prof_maya"));
assert.equal(crew.some((row) => row.id === "prof_other"), false);

const addable = addableThreadPeople(danaThread, roster, profiles, members, jobs, opps);
assert.ok(addable.some((row) => row.id === "prof_other"));
assert.equal(addable.some((row) => row.id === "prof_maya"), false);

function isAdminLike(viewer: ReturnType<typeof viewerFromStaff>) {
  return viewer.role === "company_admin" || viewer.profileRole === "company_admin";
}

console.log("message-threads.test.ts ok");
