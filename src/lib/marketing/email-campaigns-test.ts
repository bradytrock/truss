import {
  applyEmailCampaignMerge,
  resolveEmailCampaignAudience,
  type EmailCampaignRecipient,
} from "./email-campaigns";
import type { Contact, Job } from "../types";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "name" | "email">): Contact {
  return {
    clientId: null,
    title: "",
    phone: "",
    ownerStaffId: "",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
    ...partial,
  };
}

function job(partial: Partial<Job> & Pick<Job, "id" | "status">): Job {
  return {
    code: "",
    opportunityId: null,
    name: "Job",
    clientId: null,
    primaryContactId: null,
    contractValue: 0,
    startDate: "",
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
    location: "",
    ownerStaffId: "",
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
    projectType: "roofing",
    deletedAt: null,
    ...partial,
  } as Job;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const realtor = contact({
  id: "c1",
  name: "Alex Realtor",
  email: "alex@broker.com",
  isReferralPartner: true,
});
const homeowner = contact({
  id: "c2",
  name: "Sam Home",
  email: "sam@home.com",
  clientId: "cl1",
});
const noEmail = contact({
  id: "c3",
  name: "No Mail",
  email: "",
  clientId: "cl1",
});
const active = job({
  id: "j1",
  status: "in_progress",
  clientId: "cl1",
  primaryContactId: "c2",
  street: "100 Main",
  city: "Plano",
  state: "TX",
  postalCode: "75074",
});
const done = job({
  id: "j2",
  status: "complete",
  clientId: "cl1",
  primaryContactId: "c2",
  street: "100 Main",
  city: "Plano",
  postalCode: "75074",
});

const contacts = [realtor, homeowner, noEmail];
const jobs = [active, done];

assert(resolveEmailCampaignAudience("realtors", contacts, jobs).map((row) => row.email).join() === "alex@broker.com", "realtors");
assert(resolveEmailCampaignAudience("clients", contacts, jobs).map((row) => row.email).join() === "sam@home.com", "clients");
assert(resolveEmailCampaignAudience("past_clients", contacts, jobs).map((row) => row.email).join() === "sam@home.com", "past");
assert(
  resolveEmailCampaignAudience("storm", contacts, jobs, { zip: "75074" }).map((row) => row.email).join() ===
    "sam@home.com",
  "storm zip",
);
assert(resolveEmailCampaignAudience("storm", contacts, jobs, {}).length === 0, "storm needs a place");

const recipient: EmailCampaignRecipient = {
  contactId: "c2",
  jobId: "j1",
  email: "sam@home.com",
  name: "Sam Home",
  jobAddress: "100 Main, Plano, TX 75074",
  jobCity: "Plano",
};
assert(
  applyEmailCampaignMerge("Hi {{first}} at {{job.address}} — {{staff.phone}}", {
    recipient,
    companyName: "T-Rock",
    staffName: "Brady Jones",
    staffPhone: "214-555-0100",
    staffCardUrl: "https://app.example/card",
  }) === "Hi Sam at 100 Main, Plano, TX 75074 — 214-555-0100",
  "merge",
);

console.log("email-campaigns tests passed");
