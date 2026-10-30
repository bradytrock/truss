import assert from "node:assert/strict";
import type { Contact, CrmState, Job, Opportunity, SeatRole, StaffMember } from "./types.ts";
import { canSeeAllContacts, scopeBook, scopeDescription } from "./visibility.ts";

function member(id: string, role: SeatRole, teamId: string | null = null, restricted = false): StaffMember {
  return {
    id,
    name: id,
    title: role,
    role,
    teamId,
    initials: id.slice(0, 2).toUpperCase(),
    email: `${id}@example.com`,
    phone: "",
    cardSlug: id,
    emailSignature: "",
    locked: false,
    restricted,
    inviteExpiresAt: null,
    inviteToken: null,
  };
}

function contact(id: string, ownerStaffId: string, patch: Partial<Contact> = {}): Contact {
  return {
    id,
    clientId: null,
    name: id,
    title: "Homeowner",
    email: "",
    phone: "",
    ownerStaffId,
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
    ...patch,
  };
}

function opportunity(id: string, ownerStaffId: string, primaryContactId: string, referralContactId?: string): Opportunity {
  return {
    id,
    ownerStaffId,
    originatorStaffId: ownerStaffId,
    estimator: ownerStaffId,
    primaryContactId,
    referralContactId: referralContactId ?? null,
    clientId: null,
  } as Opportunity;
}

function job(id: string, ownerStaffId: string, opportunityId: string, primaryContactId: string): Job {
  return {
    id,
    ownerStaffId,
    projectManager: ownerStaffId,
    superintendent: "",
    opportunityId,
    primaryContactId,
    clientId: null,
    relatedContactIds: [],
    subcontractorIds: [],
  } as Job;
}

function book(partial: Partial<CrmState>): CrmState {
  return new Proxy(partial as CrmState, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      return [];
    },
  });
}

const admin = member("admin", "company_admin");
const director = member("director", "director");
const bd = member("bd", "business_development");
const books = member("books", "accountant");
const lead = member("lead", "team_lead", "team-a");
const pm = member("pm", "project_manager", "team-a");
const other = member("other", "project_manager", "team-b");
const restrictedBd = { ...bd, restricted: true };

const partner = contact("partner", bd.id, { isReferralPartner: true, title: "Realtor", clientId: "brokerage" });
const referrer = contact("referrer", bd.id, { isReferralPartner: true, title: "Realtor" });
const prospect = contact("prospect", bd.id);
const homeowner = contact("homeowner", pm.id);
const outsider = contact("outsider", other.id);
const onJob = contact("on-job", bd.id);
const staff = [admin, director, bd, books, lead, pm, other];
const oppPm = opportunity("opp-pm", pm.id, homeowner.id, referrer.id);
const oppOther = opportunity("opp-other", other.id, outsider.id);
const pmJob = job("job-pm", pm.id, oppPm.id, homeowner.id);
pmJob.relatedContactIds = [onJob.id];
const otherJob = job("job-other", other.id, oppOther.id, outsider.id);

const state = book({
  staff,
  contacts: [partner, referrer, prospect, homeowner, outsider, onJob],
  jobs: [pmJob, otherJob],
  opportunities: [oppPm, oppOther],
  clients: [
    { id: "brokerage", name: "Brokerage", parentClientId: "brand" } as CrmState["clients"][number],
    { id: "brand", name: "Brand", parentClientId: null } as CrmState["clients"][number],
  ],
  estimates: [{ id: "est-partner", clientId: "brokerage", jobId: null, opportunityId: null } as CrmState["estimates"][number]],
  messages: [
    { id: "msg-partner", contactId: partner.id, jobId: null, opportunityId: null } as CrmState["messages"][number],
    { id: "msg-open", contactId: null, jobId: null, opportunityId: null } as CrmState["messages"][number],
  ],
});

function ids(role: StaffMember) {
  return scopeBook(state, role).contacts.map((item) => item.id).sort();
}

assert.equal(canSeeAllContacts("company_admin"), true);
assert.equal(canSeeAllContacts("business_development"), true);
assert.equal(canSeeAllContacts("accountant"), true);
assert.equal(canSeeAllContacts("director"), false);
assert.equal(canSeeAllContacts("project_manager"), false);
assert.equal(canSeeAllContacts("team_lead"), false);
assert.equal(canSeeAllContacts("business_development", true), false);

assert.deepEqual(ids(admin), ["homeowner", "on-job", "outsider", "partner", "prospect", "referrer"]);
assert.deepEqual(ids(books), ["homeowner", "on-job", "outsider", "partner", "prospect", "referrer"]);
assert.deepEqual(ids(bd), ["homeowner", "on-job", "outsider", "partner", "prospect", "referrer"]);
assert.deepEqual(ids(director), ["homeowner", "on-job", "outsider", "referrer"]);
assert.deepEqual(ids(pm), ["homeowner", "on-job", "referrer"]);
assert.deepEqual(ids(lead), ["homeowner", "on-job", "referrer"]);
assert.deepEqual(ids(other), ["outsider"]);
assert.deepEqual(ids(restrictedBd), ["on-job", "partner", "prospect", "referrer"]);

const bdBook = scopeBook(state, bd);
assert.equal(bdBook.jobs.some((item) => item.id === otherJob.id), false);
assert.equal(bdBook.jobs.some((item) => item.id === pmJob.id), true);
assert.equal(bdBook.estimates.some((item) => item.id === "est-partner"), true);
assert.equal(bdBook.clients.some((item) => item.id === "brokerage"), true);
assert.equal(bdBook.clients.some((item) => item.id === "brand"), true);

const pmBook = scopeBook(state, pm);
assert.equal(pmBook.estimates.some((item) => item.id === "est-partner"), false);
assert.equal(pmBook.messages.some((item) => item.id === "msg-partner"), false);
assert.equal(pmBook.clients.some((item) => item.id === "brokerage"), false);
assert.equal(pmBook.contacts.some((item) => item.id === referrer.id), true);

const directorBook = scopeBook(state, director);
assert.equal(directorBook.jobs.length, 2);
assert.equal(directorBook.messages.some((item) => item.id === "msg-partner"), false);
assert.equal(directorBook.messages.some((item) => item.id === "msg-open"), true);
assert.equal(directorBook.contacts.some((item) => item.id === prospect.id), false);

assert.match(scopeDescription(bd, bd, false, []), /every contact in the company/);
assert.match(scopeDescription(director, director, false, []), /full contact book/);
assert.match(scopeDescription(director, director, false, []), /Accounting Suite/);
assert.match(scopeDescription(pm, pm, false, []), /Business development contacts/);

console.log("contact-visibility.test.ts ok");
