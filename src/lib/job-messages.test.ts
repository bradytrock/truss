import assert from "node:assert/strict";
import { mailThreads, suggestedJobsForPeople } from "./job-emails.ts";
import { contactsForTexting, jobForContact, messageThreads } from "./job-messages.ts";
import type { Contact, GmailMessage, Job, Opportunity, TextMessage } from "./types.ts";

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

const jenn = contact({ id: "c1", name: "Jenn Whitby", phone: "(940) 368-8985" });

const brokenJob = {
  id: "j1",
  name: "100 Falcon Ct",
  code: "J-100",
  primaryContactId: null,
  status: "in_progress",
  startDate: null,
  deletedAt: null,
} as unknown as Job;

const text = {
  id: "m1",
  contactId: jenn.id,
  jobId: null,
  opportunityId: null,
  direction: "inbound",
  phone: "",
  body: null,
  handle: "",
  status: null,
  mediaUrl: "",
  createdAt: null,
  createdBy: "",
} as unknown as TextMessage;

const threads = messageThreads([text], [jenn], [brokenJob], []);
assert.equal(threads.length, 1);
assert.equal(threads[0].title, "Jenn Whitby");
assert.equal(threads[0].preview, "");
assert.equal(threads[0].job, undefined);
assert.equal(jobForContact([brokenJob], [], jenn.id), undefined);

const ownedJob = {
  ...brokenJob,
  id: "j2",
  primaryContactId: jenn.id,
  relatedContactIds: undefined,
  startDate: null,
} as unknown as Job;
assert.equal(messageThreads([text], [jenn], [ownedJob], [])[0].job?.id, "j2");
assert.equal(jobForContact([ownedJob, brokenJob], [], jenn.id)?.id, "j2");

const texters = contactsForTexting([
  jenn,
  contact({ id: "c2", name: null as unknown as string, phone: null as unknown as string }),
  contact({ id: "c3", name: "No Number" }),
]);
assert.deepEqual(
  texters.map((item) => item.id),
  ["c1"],
);

const mail = mailThreads(
  [
    {
      id: "g1",
      accountId: "a1",
      gmailId: "gm1",
      threadId: "t1",
      fromName: "Jenn Whitby",
      fromEmail: "jenn@home.test",
      toEmail: null,
      subject: null,
      snippet: null,
      bodyText: null,
      receivedAt: null,
      direction: "inbound",
      jobId: null,
      contactId: jenn.id,
      ccEmail: "",
      relatedContactIds: [],
    } as unknown as GmailMessage,
  ],
  [{ ...jenn, email: "jenn@home.test" }],
  [brokenJob],
  [],
);
assert.equal(mail.length, 1);
assert.equal(mail[0].subject, "(no subject)");
assert.equal(mail[0].preview, "");
assert.equal(mail[0].job, undefined);
assert.equal(suggestedJobsForPeople([ownedJob], [], [jenn.id])[0]?.id, "j2");

const nameless = contact({
  id: "c4",
  name: null as unknown as string,
  phone: "(214) 555-0199",
});
const blankLead = {
  id: "o1",
  primaryContactId: nameless.id,
  stage: "pursuing",
  createdAt: null,
} as unknown as Opportunity;
const blankText = {
  ...text,
  id: "m-blank",
  contactId: nameless.id,
  phone: null,
  fromNumber: null,
  toNumber: "(214) 555-0199",
  body: null,
  createdAt: null,
  createdBy: null,
} as unknown as TextMessage;
const blankThreads = messageThreads([blankText], [nameless], [], [blankLead]);
assert.equal(blankThreads.length, 1);
assert.equal(blankThreads[0].title, "+12145550199");
assert.equal(blankThreads[0].preview, "");
assert.equal(blankThreads[0].opportunity?.id, "o1");

console.log("job-messages.test.ts ok");
