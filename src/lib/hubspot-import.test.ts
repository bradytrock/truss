import assert from "node:assert/strict";
import {
  applyHubSpotMapping,
  defaultHubSpotMapping,
  guessLeadSource,
  guessOwnerStaffId,
  guessStageTarget,
  hubspotDealExternalId,
  hubspotSkippedCsv,
  isDuplicateRecordIssue,
  isReadyHubSpotDraft,
  overrideHubSpotDraft,
  parseHubSpotAddress,
  parseHubSpotAmount,
  parseHubSpotCsv,
  parseHubSpotDate,
  summarizeHubSpotDrafts,
} from "./hubspot-import.ts";
import type { Contact, StaffMember } from "./types.ts";

const staff: StaffMember[] = [
  { id: "s-brady", name: "Brady Jones", email: "brady@example.com", role: "company_admin" } as StaffMember,
  { id: "s-sarah", name: "Sarah Lee", email: "sarah@example.com", role: "project_manager" } as StaffMember,
  { id: "s-locked", name: "Old Rep", email: "", role: "project_manager", locked: true } as StaffMember,
];

const contacts: Contact[] = [
  {
    id: "c-linda",
    clientId: null,
    name: "Linda Smith",
    title: "Homeowner",
    email: "linda@example.com",
    phone: "(214) 555-0101",
    ownerStaffId: "s-brady",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
  },
];

// --- header detection -------------------------------------------------------

const csv = `Record ID,Deal Name,Deal Stage,Pipeline,Amount,Create Date,Close Date,Deal owner,PM Name,Client Name,Client Email,Client Phone,Client Address,How Did They Find Us?,Deal Description,Associated Contact IDs,Weighted amount
1001,Smith — 123 Main St,Closed won,Sales Pipeline,"$12,450.00",2024-03-15 09:12,2024-04-02,Brady Jones,,Linda Smith,LINDA@example.com,2145550101,"123 Main St, Dallas, TX 75201",Google,"Hail damage.
Two-line note.",55,0
1002,Nguyen roof,Appointment scheduled,Sales Pipeline,8000,3/2/2025 2:15 PM,,Sarah Lee,,Tom Nguyen,tom@example.com,(469) 555-0199,"77 Oak Ave Plano TX 75024",Facebook,,56,0
1003,Garcia,Closed lost,Service,abc,2025-01-05,,Someone Else,,Ana Garcia,,,"9 Elm, Frisco, TX",Referral from neighbor,,57,0
1004,,Contract sent,Sales Pipeline,,,,,,,,,,,,58,0
1002,Dup,Closed won,Sales Pipeline,1,2025-01-01,,Brady Jones,,Tom Nguyen,,4695550199,,,,59,0
`;

const parsed = parseHubSpotCsv(csv);
assert.equal(parsed.rows.length, 5);
assert.equal(parsed.missingRequired.length, 0);
assert.equal(parsed.columns.recordId, "Record ID");
assert.equal(parsed.columns.source, "How Did They Find Us?");
assert.ok(parsed.ignoredColumns.includes("Associated Contact IDs"));
assert.ok(parsed.ignoredColumns.includes("Weighted amount"));
assert.deepEqual(
  parsed.pipelines.map((item) => item.value),
  ["Sales Pipeline", "Service"],
);
assert.equal(parsed.stages.find((item) => item.value === "Closed won")?.count, 2);
assert.equal(parsed.owners.find((item) => item.value === "Brady Jones")?.count, 2);
assert.equal(parsed.rows[0].values.description, "Hail damage.\nTwo-line note.");

assert.throws(() => parseHubSpotCsv("PK\u0003\u0004 workbook"), /Excel/);
assert.throws(() => parseHubSpotCsv(""), /empty/);
const missing = parseHubSpotCsv("Foo,Bar\n1,2\n");
assert.ok(missing.missingRequired.includes("Deal Stage"));
assert.ok(missing.missingRequired.includes("Client Name or Deal Name"));

// --- guesses ----------------------------------------------------------------

assert.equal(guessStageTarget("Closed won"), "complete");
assert.equal(guessStageTarget("Closed Lost"), "lost");
assert.equal(guessStageTarget("Contract sent"), "proposal_sent");
assert.equal(guessStageTarget("Appointment scheduled"), "lead");
assert.equal(guessStageTarget("Qualified to buy"), "lead");
assert.equal(guessStageTarget("In production"), "in_progress");
assert.equal(guessStageTarget("Supplement submitted"), "supplementing");
assert.equal(guessStageTarget("Unqualified"), "unqualified");
assert.equal(guessStageTarget("On hold"), "on_hold");
assert.equal(guessStageTarget(""), "lead");

assert.equal(guessLeadSource("Google"), "website");
assert.equal(guessLeadSource("Google Ads"), "google_ad");
assert.equal(guessLeadSource("Facebook"), "social_media");
assert.equal(guessLeadSource("Referral from neighbor"), "referral");
assert.equal(guessLeadSource("Angi"), "angies_list");
assert.equal(guessLeadSource("Past client"), "past_client");
assert.equal(guessLeadSource("Realtor"), "realtor");
assert.equal(guessLeadSource("Podium"), "podium");
assert.equal(guessLeadSource("Text Main Line"), "text_main_line");
assert.equal(guessLeadSource("Called in"), "phone");
assert.equal(guessLeadSource("Door knocking"), "sales_team");
assert.equal(guessLeadSource("ChatGPT"), "chatgpt");
assert.equal(guessLeadSource("Contractor Connection"), "contractor_connection");
assert.equal(guessLeadSource("Contractor Connection referral"), "contractor_connection");
assert.equal(guessLeadSource("Something odd"), "");

assert.equal(guessOwnerStaffId("Brady Jones", staff), "s-brady");
assert.equal(guessOwnerStaffId("brady jones", staff), "s-brady");
assert.equal(guessOwnerStaffId("Jones, Brady", staff), "s-brady");
assert.equal(guessOwnerStaffId("sarah@example.com", staff), "s-sarah");
assert.equal(guessOwnerStaffId("Sarah", staff), "s-sarah");
assert.equal(guessOwnerStaffId("Someone Else", staff), "");
assert.equal(guessOwnerStaffId("Old Rep", staff), "", "locked seats are not matched");

// --- value parsing ----------------------------------------------------------

assert.equal(parseHubSpotAmount("$12,450.00"), 12450);
assert.equal(parseHubSpotAmount("8000"), 8000);
assert.equal(parseHubSpotAmount(""), 0);
assert.equal(parseHubSpotAmount("abc"), null);
assert.equal(parseHubSpotAmount("-500"), -500);
assert.equal(parseHubSpotAmount("USD 1,200.50"), 1200.5);

assert.equal(parseHubSpotDate("2024-03-15")?.slice(0, 10), "2024-03-15");
assert.equal(parseHubSpotDate("2024-03-15 09:12")?.slice(0, 10), "2024-03-15");
assert.equal(parseHubSpotDate("2024-03-15T14:22:00Z"), "2024-03-15T14:22:00.000Z");
assert.equal(parseHubSpotDate("3/2/2025 2:15 PM")?.slice(0, 10), "2025-03-02");
assert.equal(parseHubSpotDate("03/02/25")?.slice(0, 10), "2025-03-02");
assert.equal(parseHubSpotDate("Mar 15, 2024")?.slice(0, 10), "2024-03-15");
assert.equal(parseHubSpotDate("not a date"), null);
assert.equal(parseHubSpotDate(""), null);

assert.deepEqual(parseHubSpotAddress("123 Main St, Dallas, TX 75201"), {
  street: "123 Main St",
  city: "Dallas",
  state: "TX",
  postalCode: "75201",
  raw: "123 Main St, Dallas, TX 75201",
});
assert.deepEqual(parseHubSpotAddress("77 Oak Ave Plano TX 75024"), {
  street: "77 Oak Ave",
  city: "Plano",
  state: "TX",
  postalCode: "75024",
  raw: "77 Oak Ave Plano TX 75024",
});
assert.deepEqual(parseHubSpotAddress("9 Elm, Frisco TX 75034"), {
  street: "9 Elm",
  city: "Frisco",
  state: "TX",
  postalCode: "75034",
  raw: "9 Elm, Frisco TX 75034",
});
assert.deepEqual(parseHubSpotAddress("500 Pine Rd\nAllen, TX 75002\nUnited States"), {
  street: "500 Pine Rd",
  city: "Allen",
  state: "TX",
  postalCode: "75002",
  raw: "500 Pine Rd, Allen, TX 75002",
});
assert.equal(parseHubSpotAddress("").raw, "");

// --- mapping + apply --------------------------------------------------------

const mapping = defaultHubSpotMapping(parsed, staff, "s-brady");
assert.equal(mapping.stages["Closed won"], "complete");
assert.equal(mapping.stages["Contract sent"], "proposal_sent");
assert.equal(mapping.owners["Brady Jones"], "s-brady");
assert.equal(mapping.owners["Someone Else"], "");
assert.equal(mapping.sources["Google"], "website");
assert.equal(mapping.pipelines["Service"], true);

const now = new Date("2026-10-29T12:00:00Z");
const drafts = applyHubSpotMapping(parsed, mapping, {
  staff,
  contacts,
  importedRecordIds: new Map([["1003", "opp-existing"]]),
  now,
});
assert.equal(drafts.length, 5);

const smith = drafts[0];
assert.equal(smith.column, "complete");
assert.equal(smith.status, "complete");
assert.equal(smith.stage, "awarded");
assert.equal(smith.amount, 12450);
assert.equal(smith.createdAt.slice(0, 10), "2024-03-15");
assert.equal(smith.closeDate, "2024-04-02");
assert.equal(smith.ownerStaffId, "s-brady");
assert.equal(smith.leadSource, "website");
assert.equal(smith.contact.existingId, "c-linda", "matches by phone");
assert.equal(smith.contact.matchedBy, "phone");
assert.equal(smith.contact.key, "id:c-linda");
assert.equal(smith.address.city, "Dallas");
assert.equal(smith.name, "Smith — 123 Main St");
assert.equal(smith.notes, "Hail damage.\nTwo-line note.");
assert.equal(smith.issues.length, 0);
assert.equal(smith.excluded, false);

const nguyen = drafts[1];
assert.equal(nguyen.column, "lead");
assert.equal(nguyen.status, "precon");
assert.equal(nguyen.stage, "pursuing");
assert.equal(nguyen.ownerStaffId, "s-sarah");
assert.equal(nguyen.leadSource, "social_media");
assert.equal(nguyen.contact.existingId, null);
assert.equal(nguyen.contact.key, "phone:4695550199");
assert.equal(nguyen.contact.phone, "(469) 555-0199");
assert.equal(nguyen.address.city, "Plano");
assert.equal(nguyen.createdAt.slice(0, 10), "2025-03-02");

const garcia = drafts[2];
assert.equal(garcia.column, "lost");
assert.equal(garcia.stage, "lost");
assert.equal(garcia.status, "on_hold");
assert.ok(garcia.issues.some((issue) => /Amount/.test(issue)), "bad amount is a hard issue");
assert.equal(garcia.ownerStaffId, "s-brady", "unknown owner falls to the default");
assert.ok(garcia.warnings.some((warning) => /Someone Else/.test(warning)));
assert.equal(garcia.existingOpportunityId, "opp-existing");
assert.equal(garcia.address.state, "TX");
assert.equal(garcia.leadSource, "referral");

const blank = drafts[3];
assert.ok(blank.issues.some((issue) => /No client name/.test(issue)));
assert.equal(blank.column, "proposal_sent");
assert.equal(blank.createdAt, now.toISOString());

const dup = drafts[4];
assert.equal(
  dup.issues.find((issue) => isDuplicateRecordIssue(issue)),
  "May be a duplicate of line 3 (same Record ID, phone, and client name).",
);
assert.deepEqual(dup.duplicateOf, { line: 3, points: ["record", "phone", "client"] });
assert.equal(dup.contact.key, "phone:4695550199", "same person as the Nguyen deal");
assert.equal(nguyen.duplicateOf, null, "the first copy of a Record ID is not flagged");

const summary = summarizeHubSpotDrafts(drafts);
assert.equal(summary.total, 5);
assert.equal(summary.ready, 2);
assert.equal(summary.blocked, 3);
assert.equal(summary.excluded, 0);
assert.equal(summary.newContacts, 1);
assert.equal(summary.matchedContacts, 1);
assert.deepEqual(
  summary.byColumn.map((item) => [item.column, item.count]),
  [
    ["lead", 1],
    ["complete", 1],
  ],
);
assert.equal(summary.totalAmount, 20450);
assert.equal(summary.byOwner.length, 2);

// Skip a stage and drop a pipeline.
const trimmed = applyHubSpotMapping(
  parsed,
  { ...mapping, stages: { ...mapping.stages, "Closed won": "skip" }, pipelines: { ...mapping.pipelines, Service: false } },
  { staff, contacts, now },
);
assert.equal(trimmed[0].excluded, true);
assert.equal(trimmed[2].excluded, true);
assert.equal(summarizeHubSpotDrafts(trimmed).excluded, 3);

// No default owner is a hard stop.
const unowned = applyHubSpotMapping(parsed, { ...mapping, owners: {}, defaultOwnerStaffId: "" }, { staff, contacts, now });
assert.ok(unowned.every((draft) => draft.issues.some((issue) => /No owner seat/.test(issue))));

// Locked seat is a hard stop.
const locked = applyHubSpotMapping(parsed, { ...mapping, owners: { "Brady Jones": "s-locked" } }, { staff, contacts, now });
assert.ok(locked[0].issues.some((issue) => /locked/.test(issue)));

const skipped = hubspotSkippedCsv(drafts);
assert.ok(skipped.startsWith('"Line","Record ID"'));
assert.equal(skipped.trim().split("\n").length, 4);

console.log("hubspot-import tests passed");

// --- row overrides ----------------------------------------------------------

const moved = overrideHubSpotDraft(smith, { column: "in_progress" }, staff);
assert.equal(moved.column, "in_progress");
assert.equal(moved.status, "in_progress");
assert.equal(moved.stage, "awarded");
assert.equal(smith.column, "complete", "original draft is untouched");

const reowned = overrideHubSpotDraft(unowned[0], { ownerStaffId: "s-sarah" }, staff);
assert.equal(reowned.ownerStaffId, "s-sarah");
assert.equal(reowned.ownerName, "Sarah Lee");
assert.ok(!reowned.issues.some((issue) => /No owner seat/.test(issue)));

const dropped = overrideHubSpotDraft(smith, { excluded: true }, staff);
assert.equal(dropped.excluded, true);
assert.equal(overrideHubSpotDraft(smith, undefined, staff), smith);

const kept = overrideHubSpotDraft(dup, { allowDuplicate: true, excluded: false }, staff);
assert.equal(kept.duplicateAllowed, true);
assert.equal(kept.duplicateSharesRecordId, true);
assert.equal(kept.excluded, false);
assert.equal(kept.existingOpportunityId, null);
assert.ok(!kept.issues.some(isDuplicateRecordIssue));
assert.ok(kept.warnings.some((warning) => /own deal/.test(warning)));
assert.ok(kept.warnings.some((warning) => /same Record ID, phone, and client name/.test(warning)));
assert.equal(isReadyHubSpotDraft(kept), true);
assert.equal(hubspotDealExternalId(kept), undefined);
assert.equal(hubspotDealExternalId(smith), "1001");
assert.equal(dup.issues.some(isDuplicateRecordIssue), true, "original duplicate row stays blocked");

const stillBlocked = overrideHubSpotDraft(
  { ...dup, issues: [...dup.issues, "Amount “abc” is not a number."] },
  { allowDuplicate: true },
  staff,
);
assert.equal(stillBlocked.duplicateAllowed, true);
assert.ok(!stillBlocked.issues.some(isDuplicateRecordIssue));
assert.ok(stillBlocked.issues.some((issue) => /Amount/.test(issue)));
assert.equal(isReadyHubSpotDraft(stillBlocked), false);

const repeatedExisting = overrideHubSpotDraft(
  {
    ...dup,
    existingOpportunityId: "opp-existing",
    warnings: ["Already imported; this run updates it."],
  },
  { allowDuplicate: true },
  staff,
);
assert.equal(repeatedExisting.existingOpportunityId, null);
assert.ok(!repeatedExisting.warnings.some((warning) => /Already imported/.test(warning)));
assert.equal(repeatedExisting.warnings.filter((warning) => /own deal/.test(warning)).length, 1);

const again = overrideHubSpotDraft(kept, { allowDuplicate: true }, staff);
assert.equal(again.warnings.filter((warning) => /own deal/.test(warning)).length, 1);

const afterAllow = summarizeHubSpotDrafts(drafts.map((draft) => (draft.line === dup.line ? kept : draft)));
assert.equal(afterAllow.ready, 3);
assert.equal(afterAllow.blocked, 2);

console.log("hubspot-import override tests passed");

// --- similar rows, not only a repeated Record ID ---------------------------

const similarCsv = `Record ID,Deal Name,Deal Stage,Client Name,Client Phone,Client Email,Client Address,Amount
2001,Oak roof replacement,Appointment scheduled,Tom Nguyen,(469) 555-0199,tom@example.com,"77 Oak Ave, Plano, TX 75024",1000
2002,Cedar siding,Appointment scheduled,Tom Nguyen,(469) 555-0199,tom@example.com,"12 Cedar Ln, Plano, TX 75024",2000
2003,Oak roof replacement,Appointment scheduled,Tom Nguyen,2145550102,other@example.com,"77 Oak Ave, Plano, TX 75024",3000
2004,Pine addition,Appointment scheduled,Someone Else,(469) 555-0199,else@example.com,"500 Pine Rd, Allen, TX 75002",4000
2005,Oak roof replacement,Appointment scheduled,Pat Lee,2145550103,pat@example.com,"8 Birch St, Dallas, TX 75201",5000
2006,Frisco roof,Appointment scheduled,Ana Garcia,9725550100,ana@example.com,"9 Elm, Frisco, TX 75034",6000
2007,Frisco follow up,Appointment scheduled,Ana Garcia,9725550100,ana@example.com,"9 Elm, Frisco, TX 75034",7000
3001,First roof job,Appointment scheduled,Alice Jones,2145551111,alice@example.com,"1 First St, Dallas, TX 75201",100
3001,Completely other,Appointment scheduled,Bob Miles,4695552222,bob@example.com,"2 Second St, Plano, TX 75024",200
`;

const similarParsed = parseHubSpotCsv(similarCsv);
const similarMapping = defaultHubSpotMapping(similarParsed, staff, "s-brady");
const similar = applyHubSpotMapping(similarParsed, similarMapping, {
  staff,
  contacts,
  importedRecordIds: new Map([["2003", "opp-2003"]]),
  now,
});
const byRecord = (id: string, occurrence = 0) => similar.filter((draft) => draft.recordId === id)[occurrence];

const samePerson = byRecord("2002");
assert.equal(samePerson.duplicateOf, null, "same phone, email, and client with a different job is not a duplicate");
assert.equal(samePerson.issues.length, 0);

const sameHouse = byRecord("2003");
assert.equal(
  sameHouse.issues.find((issue) => isDuplicateRecordIssue(issue)),
  "May be a duplicate of line 2 (same client name, street, and deal name).",
);
assert.equal(sameHouse.existingOpportunityId, "opp-2003");

const phoneOnly = byRecord("2004");
assert.equal(phoneOnly.duplicateOf, null, "a shared phone alone is the same homeowner, not a duplicate deal");

const nameOnly = byRecord("2005");
assert.equal(nameOnly.duplicateOf, null, "a shared deal name alone is not a duplicate");

const frisco = byRecord("2007");
assert.equal(
  frisco.issues.find((issue) => isDuplicateRecordIssue(issue)),
  "May be a duplicate of line 7 (same phone, email, client name, and street).",
);

const recordOnly = byRecord("3001", 1);
assert.equal(recordOnly.issues.find((issue) => isDuplicateRecordIssue(issue)), "May be a duplicate of line 9 (same Record ID).");
assert.equal(byRecord("3001").duplicateOf, null);

const fuzzyKept = overrideHubSpotDraft(sameHouse, { allowDuplicate: true, excluded: false }, staff);
assert.equal(fuzzyKept.duplicateAllowed, true);
assert.equal(fuzzyKept.duplicateSharesRecordId, false);
assert.equal(fuzzyKept.existingOpportunityId, "opp-2003", "a different Record ID still updates the deal already imported");
assert.ok(fuzzyKept.warnings.some((warning) => /Already imported/.test(warning)));
assert.ok(fuzzyKept.warnings.some((warning) => /same client name, street, and deal name/.test(warning)));
assert.ok(fuzzyKept.warnings.some((warning) => /still updates this Record ID/.test(warning)));
assert.equal(hubspotDealExternalId(fuzzyKept), "2003");
assert.equal(isReadyHubSpotDraft(fuzzyKept), true);

const recordKept = overrideHubSpotDraft(recordOnly, { allowDuplicate: true }, staff);
assert.equal(recordKept.duplicateSharesRecordId, true);
assert.equal(hubspotDealExternalId(recordKept), undefined);

console.log("hubspot-import similarity tests passed");
