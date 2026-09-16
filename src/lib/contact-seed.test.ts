import assert from "node:assert/strict";
import {
  contactSeedLeadName,
  contactSeedLeadSource,
  hasJobSite,
  previousJobForContact,
  previousJobSite,
  resolveContactSeedSite,
  splitContactName,
} from "./contact-seed.ts";
import type { Contact, Job } from "./types.ts";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    clientId: null,
    title: "Homeowner",
    email: "",
    phone: "",
    ownerStaffId: "staff_1",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
    ...partial,
  };
}

function job(partial: Partial<Job> & Pick<Job, "id" | "name">): Job {
  return {
    code: "BJ1",
    opportunityId: null,
    clientId: null,
    primaryContactId: "c1",
    status: "complete",
    contractValue: 0,
    startDate: "2026-08-01",
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
    location: "",
    ownerStaffId: "",
    description: "",
    tags: [],
    street: "100 Main St",
    city: "Flower Mound",
    state: "TX",
    postalCode: "75028",
    salesRep: "",
    assigned: [],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "roofing",
    market: "residential",
    leadSource: "website",
    primaryPhotoId: null,
    deletedAt: null,
    deletedReason: "",
    deletedBy: "",
    ...partial,
  } as Job;
}

assert.deepEqual(splitContactName("Don Ojamaye"), { first: "Don", last: "Ojamaye" });
assert.deepEqual(splitContactName("Prince"), { first: "Prince", last: "Prince" });

const person = contact({ id: "c1", name: "Don Ojamaye" });
const older = job({ id: "j1", name: "Old", startDate: "2025-01-01", street: "1 Oak" });
const newer = job({ id: "j2", name: "New", startDate: "2026-08-20", street: "2613 Creekside Place" });
assert.equal(previousJobForContact(person, [older, newer])?.id, "j2");
assert.equal(previousJobForContact(person, [job({ id: "gone", name: "Gone", deletedAt: "2026-01-01" })]), null);

const site = previousJobSite(newer);
assert.equal(hasJobSite(site), true);
assert.equal(site.street, "2613 Creekside Place");

const same = resolveContactSeedSite({
  hasPreviousSite: true,
  sameAsPrevious: true,
  previous: site,
  next: { street: "", city: "", state: "", postalCode: "" },
});
assert.equal(same.blocked, null);
assert.equal(same.site.street, "2613 Creekside Place");

const missing = resolveContactSeedSite({
  hasPreviousSite: false,
  sameAsPrevious: false,
  previous: { street: "", city: "", state: "", postalCode: "" },
  next: { street: "", city: "", state: "TX", postalCode: "" },
});
assert.equal(missing.blocked, "Enter the street and city for the new address.");

const fresh = resolveContactSeedSite({
  hasPreviousSite: true,
  sameAsPrevious: false,
  previous: site,
  next: { street: "9001 Longwood", city: "Flower Mound", state: "", postalCode: "75028" },
});
assert.equal(fresh.blocked, null);
assert.equal(fresh.site.state, "TX");
assert.equal(fresh.site.street, "9001 Longwood");

assert.equal(contactSeedLeadSource(newer), "past_client");
assert.equal(contactSeedLeadSource(null), "phone");
assert.match(contactSeedLeadName("Don Ojamaye", fresh.site), /Ojamaye — 9001 Longwood/);

console.log("contact-seed tests passed");
