import assert from "node:assert/strict";
import {
  escapeLeadAssignHtml,
  leadAssignEmailHtml,
  leadAssignEmailSubject,
  leadAssignEmailText,
  leadAssignPropertyAddress,
  leadAssignRecipients,
  parseLeadAssignOpportunityId,
  parseVoiceLeadAssignContext,
} from "./lead-assign-email.ts";

const fields = {
  homeownerName: "Dana Alvarez",
  homeownerPhone: "(214) 555-0101",
  homeownerEmail: "dana@home.test",
  propertyAddress: "100 Main, Plano, TX 75074",
  notes: "Storm damage on the south slope.",
  assignedToName: "Alex Rivera",
};

assert.equal(
  leadAssignPropertyAddress({
    street: "100 Main",
    city: "Plano",
    state: "TX",
    postalCode: "75074",
  }),
  "100 Main, Plano, TX 75074",
);
assert.equal(
  leadAssignPropertyAddress({ location: "Address TBD" }),
  "Address TBD",
);
assert.equal(leadAssignPropertyAddress({}), "Address TBD");

assert.equal(
  leadAssignEmailSubject("assignee", "Alex Rivera", "100 Main, Plano, TX 75074"),
  "New Lead assigned to you - 100 Main, Plano, TX 75074",
);
assert.equal(
  leadAssignEmailSubject("team_lead", "Alex Rivera", "100 Main, Plano, TX 75074"),
  "New Lead for Alex Rivera - 100 Main, Plano, TX 75074",
);
assert.equal(leadAssignEmailSubject("team_lead", "  ", ""), "New Lead for a teammate - Address TBD");

const text = leadAssignEmailText(fields);
assert.match(text, /Homeowner name: Dana Alvarez/);
assert.match(text, /Homeowner phone number: \(214\) 555-0101/);
assert.match(text, /Homeowner email: dana@home.test/);
assert.match(text, /Homeowner property address: 100 Main, Plano, TX 75074/);
assert.match(text, /Notes: Storm damage on the south slope\./);

const empty = leadAssignEmailText({
  homeownerName: "",
  homeownerPhone: "",
  homeownerEmail: "",
  propertyAddress: "",
  notes: "",
  assignedToName: "Alex",
});
assert.match(empty, /Homeowner name: —/);
assert.match(empty, /Notes: —/);

const html = leadAssignEmailHtml(fields);
assert.match(html, /Homeowner name/);
assert.match(html, /Dana Alvarez/);
assert.match(html, /Storm damage on the south slope/);
assert.equal(escapeLeadAssignHtml("<script>"), "&lt;script&gt;");
assert.match(leadAssignEmailHtml({ ...fields, notes: "<b>hi</b>" }), /&lt;b&gt;hi&lt;\/b&gt;/);

const alex = {
  id: "staff_alex",
  name: "Alex Rivera",
  email: "alex@company.test",
  teamId: "team_field",
  role: "project_manager",
};
const luis = {
  id: "staff_luis",
  name: "Luis Chen",
  email: "luis@company.test",
  teamId: "team_field",
  role: "team_lead",
};
const lockedLead = {
  id: "staff_locked",
  name: "Locked Lead",
  email: "locked@company.test",
  teamId: "team_field",
  role: "team_lead",
  locked: true,
};
const solo = {
  id: "staff_solo",
  name: "Sam Solo",
  email: "sam@company.test",
  teamId: null,
  role: "estimator",
};
const noEmail = {
  id: "staff_blank",
  name: "No Mail",
  email: "not-an-email",
  teamId: "team_field",
  role: "project_manager",
};

assert.deepEqual(
  leadAssignRecipients({
    assignee: solo,
    staff: [solo, luis],
    teams: [{ id: "team_field", leadStaffId: "staff_luis" }],
  }),
  [{ role: "assignee", staffId: "staff_solo", name: "Sam Solo", email: "sam@company.test" }],
);

assert.deepEqual(
  leadAssignRecipients({
    assignee: alex,
    staff: [alex, luis, lockedLead],
    teams: [{ id: "team_field", leadStaffId: "staff_luis" }],
  }),
  [
    { role: "assignee", staffId: "staff_alex", name: "Alex Rivera", email: "alex@company.test" },
    { role: "team_lead", staffId: "staff_luis", name: "Luis Chen", email: "luis@company.test" },
  ],
);

assert.deepEqual(
  leadAssignRecipients({
    assignee: luis,
    staff: [alex, luis],
    teams: [{ id: "team_field", leadStaffId: "staff_luis" }],
  }),
  [{ role: "assignee", staffId: "staff_luis", name: "Luis Chen", email: "luis@company.test" }],
);

assert.deepEqual(
  leadAssignRecipients({
    assignee: { ...alex, locked: true },
    staff: [alex, luis],
    teams: [{ id: "team_field", leadStaffId: "staff_luis" }],
  }),
  [],
);

assert.deepEqual(
  leadAssignRecipients({
    assignee: noEmail,
    staff: [noEmail, luis],
    teams: [{ id: "team_field", leadStaffId: "staff_luis" }],
  }),
  [{ role: "team_lead", staffId: "staff_luis", name: "Luis Chen", email: "luis@company.test" }],
);

assert.equal(parseLeadAssignOpportunityId({ opportunityId: "  abc  " }), "abc");
assert.equal(parseLeadAssignOpportunityId({}), "");

const voice = parseVoiceLeadAssignContext({
  ok: true,
  ownerStaffId: "staff_alex",
  assignedToName: "Alex Rivera",
  homeownerName: "Dana Alvarez",
  homeownerPhone: "(214) 555-0101",
  homeownerEmail: "dana@home.test",
  propertyAddress: "100 Main, Plano, TX 75074",
  notes: "Storm damage",
  companyName: "T-Rock",
  companyEmail: "office@company.test",
  staff: [alex, luis],
  teams: [{ id: "team_field", leadStaffId: "staff_luis" }],
});
assert.equal(voice?.fields.homeownerName, "Dana Alvarez");
assert.equal(voice?.assignee?.id, "staff_alex");
assert.deepEqual(
  leadAssignRecipients(voice!),
  [
    { role: "assignee", staffId: "staff_alex", name: "Alex Rivera", email: "alex@company.test" },
    { role: "team_lead", staffId: "staff_luis", name: "Luis Chen", email: "luis@company.test" },
  ],
);
assert.equal(parseVoiceLeadAssignContext({ ok: false }), null);

console.log("lead-assign-email.test.ts ok");
