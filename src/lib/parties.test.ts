import assert from "node:assert/strict";
import {
  canAddSecondHomeowner,
  customerContactDetails,
  relatedContactIdsWithHomeowner,
  secondHomeownerDraft,
} from "./parties.ts";
import type { Contact, Job } from "./types.ts";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    clientId: null,
    title: "Homeowner",
    email: "",
    phone: "",
    ownerStaffId: "staff-1",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
    ...partial,
  };
}

function job(partial: Partial<Job> & Pick<Job, "id" | "primaryContactId">): Job {
  return {
    relatedContactIds: [],
    subcontractorIds: [],
    ...partial,
  } as Job;
}

const dana = contact({ id: "c1", name: "Dana Alvarez", phone: "2145550101" });
const jordan = contact({ id: "c2", name: "Jordan Alvarez" });
const adjuster = contact({ id: "c3", name: "Pat Adjuster", title: "Public adjuster" });

assert.equal(canAddSecondHomeowner(undefined, [dana]), false);
assert.equal(canAddSecondHomeowner(job({ id: "j1", primaryContactId: "" }), [dana]), false);
assert.equal(
  canAddSecondHomeowner(job({ id: "j1", primaryContactId: dana.id }), [dana]),
  true,
);
assert.equal(
  canAddSecondHomeowner(
    job({ id: "j1", primaryContactId: dana.id, relatedContactIds: [jordan.id] }),
    [dana, jordan],
  ),
  false,
);
assert.equal(
  canAddSecondHomeowner(
    job({ id: "j1", primaryContactId: dana.id, relatedContactIds: [adjuster.id] }),
    [dana, adjuster],
  ),
  true,
);

assert.deepEqual(relatedContactIdsWithHomeowner(["c1"], "c2"), ["c1", "c2"]);
assert.deepEqual(relatedContactIdsWithHomeowner(["c2"], "c2"), ["c2"]);
assert.deepEqual(relatedContactIdsWithHomeowner(["c1"], "  "), ["c1"]);

const draft = secondHomeownerDraft({
  name: "  Jordan Alvarez  ",
  email: " jordan@home.test ",
  phone: "2145550199",
  clientId: null,
  ownerStaffId: "staff-1",
});
assert.equal(draft.name, "Jordan Alvarez");
assert.equal(draft.title, "Homeowner");
assert.equal(draft.isReferralPartner, false);
assert.equal(draft.email, "jordan@home.test");

const book = {
  clients: [],
  contacts: [dana, jordan],
  jobs: [job({ id: "j1", primaryContactId: dana.id, relatedContactIds: [jordan.id] })],
  opportunities: [],
};
assert.deepEqual(
  customerContactDetails({ jobId: "j1" }, book),
  {
    phone: "2145550101",
    email: "",
    secondPhone: "",
    secondEmail: "",
  },
);
jordan.email = "jordan@home.test";
jordan.phone = "4695550199";
assert.equal(customerContactDetails({ contactId: dana.id, secondContactId: jordan.id }, book).secondEmail, "jordan@home.test");

console.log("parties.test.ts ok");
