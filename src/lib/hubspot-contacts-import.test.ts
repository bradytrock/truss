import assert from "node:assert/strict";
import {
  HUBSPOT_CONTACTS_TEMPLATE_CSV,
  HUBSPOT_CONTACTS_TEMPLATE_HEADERS,
  applyHubSpotContactsMapping,
  defaultBdOwnerStaffId,
  defaultHubSpotContactsMapping,
  guessCompanyType,
  hubspotCompanyParentOptions,
  hubspotContactsSkippedCsv,
  overrideHubSpotContactDraft,
  parseHubSpotContactsCsv,
  sortBdSeatsFirst,
  summarizeHubSpotContactDrafts,
} from "./hubspot-contacts-import.ts";
import type { Client, Contact, StaffMember } from "./types.ts";

const staff: StaffMember[] = [
  { id: "s-brady", name: "Brady Jones", email: "brady@example.com", role: "company_admin" } as StaffMember,
  { id: "s-bd", name: "Casey Reed", email: "casey@example.com", role: "business_development" } as StaffMember,
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
    ownerStaffId: "s-sarah",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
  },
  {
    id: "c-imported",
    clientId: "cl-compass",
    name: "Dana Alvarez",
    title: "Realtor",
    email: "",
    phone: "",
    ownerStaffId: "s-bd",
    isReferralPartner: true,
    listingWatchUrl: "",
    listingWatchEnabled: false,
    externalSource: "hubspot",
    externalId: "3001",
  },
];

const clients: Client[] = [
  { id: "cl-compass", name: "Compass Real Estate", type: "realtor", city: "Dallas", state: "TX", notes: "" },
];

// --- default seat ---------------------------------------------------------------

assert.equal(defaultBdOwnerStaffId(staff, "s-brady"), "s-bd");
assert.equal(defaultBdOwnerStaffId(staff.filter((member) => member.id !== "s-bd"), "s-brady"), "s-brady");
assert.equal(defaultBdOwnerStaffId([staff[3]], "s-nobody"), "");
assert.equal(sortBdSeatsFirst(staff)[0].id, "s-bd");

// --- company type guesses -------------------------------------------------------

assert.equal(guessCompanyType("Compass Real Estate"), "realtor");
assert.equal(guessCompanyType("State Farm Insurance"), "insurance");
assert.equal(guessCompanyType("Summit Claims Group"), "insurance");
assert.equal(guessCompanyType("Lone Star Roofing Supply"), "trade_partner");
assert.equal(guessCompanyType("City of Plano"), "public");
assert.equal(guessCompanyType("Acme Widgets"), "owner");
assert.equal(guessCompanyType(""), "owner");

// --- header detection (the office template) -------------------------------------

const csv = `${HUBSPOT_CONTACTS_TEMPLATE_HEADERS.join(",")},Associated Deals,Email Domain
3001,Dana,Alvarez,DANA@example.com,2145550142,Casey Reed,9876543210,2025-02-11 10:04,Open,Marketing contact,2024-06-03 09:12,Compass Real Estate,2,example.com
3002,Tom,Nguyen,tom@example.com,(469) 555-0199,Someone Else,,,,Non-marketing contact,3/2/2025 2:15 PM,Allied Adjusters,0,
3003,,,linda@EXAMPLE.com,,Brady Jones,,,Unqualified,,2025-01-05,,0,
3004,Ana,Garcia,,555-01,Sarah Lee,,,Open,,,Compass Real Estate,0,
3005,,,,,,,,,,,,0,
3002,Tom,Nguyen,,4695550199,Brady Jones,,,,,,,0,
`;

const parsed = parseHubSpotContactsCsv(csv);
assert.equal(parsed.missingRequired.length, 0);
assert.equal(parsed.rows.length, 6);
assert.equal(parsed.columns.recordId, "Record ID");
assert.equal(parsed.columns.firstName, "First Name");
assert.equal(parsed.columns.phone, "Phone Number");
assert.equal(parsed.columns.owner, "Contact owner");
assert.equal(parsed.columns.companyName, "Associated Company");
assert.equal(parsed.columns.companyId, "Primary Associated Company ID");
assert.equal(parsed.columns.marketingStatus, "Marketing contact status");
assert.ok(parsed.ignoredColumns.includes("Associated Deals"));
assert.ok(parsed.ignoredColumns.includes("Email Domain"));
assert.deepEqual(
  parsed.owners.map((item) => item.value),
  ["Brady Jones", "Casey Reed", "Sarah Lee", "Someone Else"],
);
assert.deepEqual(
  parsed.companies.map((item) => [item.value, item.count, item.hubspotId]),
  [
    ["Compass Real Estate", 2, "9876543210"],
    ["Allied Adjusters", 1, ""],
  ],
);
assert.deepEqual(
  parsed.leadStatuses.map((item) => item.value),
  ["Open", "Unqualified"],
);

// A deals export is not a contacts export.
const noNames = parseHubSpotContactsCsv("Record ID,Deal Name,Amount\n1,Smith,100\n");
assert.deepEqual(noNames.missingRequired, ["First Name and Last Name (or Email)"]);

// A single Name column still works.
const single = parseHubSpotContactsCsv("Name,Email\nMary Ann Lee,mary@example.com\n");
assert.equal(single.missingRequired.length, 0);
assert.equal(single.columns.fullName, "Name");

assert.throws(() => parseHubSpotContactsCsv("PK\u0003\u0004"), /Excel/);

// --- default mapping -------------------------------------------------------------

const mapping = defaultHubSpotContactsMapping(parsed, staff, "s-bd");
assert.equal(mapping.referralPartner, true);
assert.equal(mapping.defaultOwnerStaffId, "s-bd");
assert.equal(mapping.owners["Casey Reed"], "s-bd");
assert.equal(mapping.owners["Brady Jones"], "s-brady");
assert.equal(mapping.owners["Someone Else"], "");
assert.equal(mapping.companies["Compass Real Estate"], "realtor");
assert.equal(mapping.companies["Allied Adjusters"], "insurance");
assert.deepEqual(mapping.leadStatuses, { Open: true, Unqualified: true });

// --- drafts ------------------------------------------------------------------------

const importedRecordIds = new Map([["3001", "c-imported"]]);
const drafts = applyHubSpotContactsMapping(parsed, mapping, {
  staff,
  contacts,
  clients,
  importedRecordIds,
  now: new Date("2026-01-01T12:00:00Z"),
});
assert.equal(drafts.length, 6);
const [dana, tom, linda, ana, blank, tomAgain] = drafts;

// Record ID match updates the earlier import and keeps the Truss name.
assert.equal(dana.existingId, "c-imported");
assert.equal(dana.matchedBy, "record");
assert.equal(dana.name, "Dana Alvarez");
assert.equal(dana.email, "dana@example.com");
assert.equal(dana.phone, "(214) 555-0142");
assert.equal(dana.ownerStaffId, "s-bd");
assert.equal(dana.isReferralPartner, true);
assert.equal(dana.title, "Referral partner");
assert.equal(dana.company?.existingId, "cl-compass");
assert.equal(dana.company?.type, "realtor");
assert.equal(dana.leadStatus, "Open");
assert.equal(dana.marketingStatus, "Marketing contact");
assert.equal(dana.createdAt.slice(0, 4), "2024");
assert.ok(dana.lastActivityAt);
assert.equal(dana.issues.length, 0);
assert.ok(dana.warnings.some((warning) => /already imported/i.test(warning)));

// Unmatched owner falls back to the default (BD) seat.
assert.equal(tom.ownerStaffId, "s-bd");
assert.ok(tom.warnings.some((warning) => /not a seat/.test(warning)));
assert.equal(tom.company?.existingId, null);
assert.equal(tom.company?.type, "insurance");
assert.equal(tom.existingId, null);
assert.equal(tom.issues.length, 0);

// Email-only row matches Linda, moves her to Brady, and keeps her Truss name.
assert.equal(linda.existingId, "c-linda");
assert.equal(linda.matchedBy, "email");
assert.equal(linda.name, "Linda Smith");
assert.equal(linda.ownerStaffId, "s-brady");
assert.equal(linda.previousOwnerStaffId, "s-sarah");
assert.ok(linda.warnings.some((warning) => warning === "Moves from Sarah Lee to Brady Jones."));
assert.ok(linda.warnings.some((warning) => /email address is used as the name/.test(warning)));
assert.equal(linda.issues.length, 0);

// Bad phone is a note, not a block.
assert.ok(ana.warnings.some((warning) => /did not read as a US number/.test(warning)));
assert.equal(ana.ownerStaffId, "s-sarah");
assert.equal(ana.issues.length, 0);

// Nothing to go on.
assert.ok(blank.issues.includes("No name or email."));

// Same phone as an earlier row: left out, and the duplicate Record ID is flagged.
assert.equal(tomAgain.excluded, true);
assert.equal(tomAgain.key, tom.key);
assert.ok(tomAgain.warnings.some((warning) => /Same person as line 3/.test(warning)));
assert.ok(tomAgain.issues.some((issue) => /Record ID 3002 appears twice/.test(issue)));

// Lead status can be left out on the Map step.
const withoutUnqualified = applyHubSpotContactsMapping(
  parsed,
  { ...mapping, leadStatuses: { ...mapping.leadStatuses, Unqualified: false } },
  { staff, contacts, clients, importedRecordIds },
);
assert.equal(withoutUnqualified[2].excluded, true);
assert.ok(withoutUnqualified[2].warnings.some((warning) => /Unqualified/.test(warning)));

// The toggle off leaves every contact a homeowner.
const noPartners = applyHubSpotContactsMapping(parsed, { ...mapping, referralPartner: false }, { staff, contacts, clients });
assert.ok(noPartners.every((draft) => !draft.isReferralPartner));
assert.equal(noPartners[1].title, "Homeowner");

// No default seat blocks every unmatched row.
const noSeat = applyHubSpotContactsMapping(parsed, { ...mapping, defaultOwnerStaffId: "" }, { staff, contacts, clients });
assert.ok(noSeat[1].issues.includes("No owner seat. Pick a default seat."));

// --- summary -----------------------------------------------------------------------

const summary = summarizeHubSpotContactDrafts(drafts);
assert.equal(summary.total, 6);
assert.equal(summary.ready, 4);
assert.equal(summary.blocked, 1);
assert.equal(summary.excluded, 1);
assert.equal(summary.updates, 2);
assert.equal(summary.newContacts, 2);
assert.equal(summary.referralPartners, 4);
assert.equal(summary.newCompanies, 1);
assert.equal(summary.matchedCompanies, 1);
assert.deepEqual(
  summary.byOwner.map((entry) => [entry.name, entry.count, entry.partners]),
  [
    ["Casey Reed", 2, 2],
    ["Brady Jones", 1, 1],
    ["Sarah Lee", 1, 1],
  ],
);

// --- overrides ---------------------------------------------------------------------

const moved = overrideHubSpotContactDraft(tom, { ownerStaffId: "s-sarah" }, staff);
assert.equal(moved.ownerStaffId, "s-sarah");
assert.equal(moved.ownerName, "Sarah Lee");
assert.ok(!moved.warnings.some((warning) => /not a seat/.test(warning)));

const lockedSeat = overrideHubSpotContactDraft(tom, { ownerStaffId: "s-locked" }, staff);
assert.ok(lockedSeat.issues.some((issue) => /locked/.test(issue)));

const movedBack = overrideHubSpotContactDraft(linda, { ownerStaffId: "s-sarah" }, staff);
assert.ok(!movedBack.warnings.some((warning) => /^Moves from/.test(warning)));

const notPartner = overrideHubSpotContactDraft(tom, { isReferralPartner: false }, staff);
assert.equal(notPartner.isReferralPartner, false);
assert.equal(notPartner.title, "Homeowner");
assert.equal(overrideHubSpotContactDraft(notPartner, { isReferralPartner: true }, staff).title, "Referral partner");

const unlinked = overrideHubSpotContactDraft(tom, { companyType: "skip" }, staff);
assert.equal(unlinked.company?.type, "skip");
assert.equal(summarizeHubSpotContactDrafts([unlinked]).newCompanies, 0);

const included = overrideHubSpotContactDraft(tomAgain, { excluded: false }, staff);
assert.equal(included.excluded, false);
assert.equal(overrideHubSpotContactDraft(tom, undefined, staff), tom);

// A title from the file survives the toggle.
const titled = parseHubSpotContactsCsv("First Name,Last Name,Job Title,Email\nPat,Lee,Broker,pat@example.com\n");
const titledDraft = applyHubSpotContactsMapping(
  titled,
  defaultHubSpotContactsMapping(titled, staff, "s-bd"),
  { staff, contacts: [], clients: [] },
)[0];
assert.equal(titledDraft.title, "Broker");
assert.ok(titledDraft.warnings.some((warning) => /No Record ID/.test(warning)));
assert.equal(overrideHubSpotContactDraft(titledDraft, { isReferralPartner: false }, staff).title, "Broker");

// --- skipped csv -------------------------------------------------------------------

const skipped = hubspotContactsSkippedCsv(drafts);
const skippedLines = skipped.trim().split("\n");
assert.equal(skippedLines.length, 3);
assert.ok(skippedLines[0].startsWith('"Line","Record ID","First Name"'));
assert.ok(skippedLines.some((line) => line.includes("No name or email.")));
assert.ok(skippedLines.some((line) => line.includes("Same person as line 3")));

// --- parent companies -----------------------------------------------------------------

const brandCsv = `First Name,Last Name,Email,Associated Company
Amy,Hill,amy@example.com,Keller Williams
Bo,Lane,bo@example.com,Keller Williams Realty
Cy,Park,cy@example.com,EXP Realty LLC
Di,Ruiz,di@example.com,eXp Realty of Texas
Ed,Shaw,ed@example.com,Compass Real Estate
Flo,Tran,flo@example.com,Allied Adjusters
`;
const brandParsed = parseHubSpotContactsCsv(brandCsv);
const brandClients: Client[] = [
  ...clients,
  { id: "cl-allied", name: "Allied Adjusters", type: "insurance", city: "", state: "", notes: "" },
];
const brandMapping = defaultHubSpotContactsMapping(brandParsed, staff, "s-bd", brandClients);

// Suggestions: the brand itself has no parent, offices point at it, known franchises are filled in.
assert.equal(brandMapping.companyParents["Keller Williams"], "");
assert.equal(brandMapping.companyParents["Keller Williams Realty"], "Keller Williams");
assert.equal(brandMapping.companyParents["EXP Realty LLC"], "eXp Realty");
assert.equal(brandMapping.companyParents["eXp Realty of Texas"], "eXp Realty");
assert.equal(brandMapping.companyParents["Compass Real Estate"], "Compass");
assert.equal(brandMapping.companyParents["Allied Adjusters"], "");
assert.deepEqual(
  hubspotCompanyParentOptions(brandMapping).map((option) => [option.name, option.count]),
  [
    ["eXp Realty", 2],
    ["Compass", 1],
    ["Keller Williams", 1],
  ],
);

const brandDrafts = applyHubSpotContactsMapping(brandParsed, brandMapping, { staff, contacts: [], clients: brandClients });
const [amy, bo, cy, di, ed, flo] = brandDrafts;
// Keller Williams is a company in the file and the parent of its office; both share one key.
assert.equal(amy.company?.parent, null);
assert.equal(bo.company?.parent?.name, "Keller Williams");
assert.equal(bo.company?.parent?.key, amy.company?.key);
assert.equal(bo.company?.parent?.existingId, null);
// A new parent that is not a row in the file.
assert.equal(cy.company?.parent?.name, "eXp Realty");
assert.equal(di.company?.parent?.key, cy.company?.parent?.key);
assert.equal(ed.company?.existingId, "cl-compass");
assert.equal(ed.company?.parent?.name, "Compass");
assert.equal(flo.company?.parent, null);

const brandSummary = summarizeHubSpotContactDrafts(brandDrafts);
assert.equal(brandSummary.newCompanies, 4);
assert.equal(brandSummary.matchedCompanies, 2);
// eXp Realty and Compass are new parents; Keller Williams is added as a company, not again as a parent.
assert.equal(brandSummary.newParents, 2);
assert.equal(brandSummary.groupedCompanies, 4);
assert.deepEqual(
  brandSummary.byParent.map((parent) => [parent.name, parent.companies, parent.contacts]),
  [
    ["eXp Realty", ["EXP Realty LLC", "eXp Realty of Texas"], 2],
    ["Compass", ["Compass Real Estate"], 1],
    ["Keller Williams", ["Keller Williams Realty"], 1],
  ],
);

// Picking a parent that is the company itself means no parent; clearing it drops the grouping.
const selfParent = applyHubSpotContactsMapping(
  brandParsed,
  { ...brandMapping, companyParents: { ...brandMapping.companyParents, "Keller Williams Realty": "keller williams realty" } },
  { staff, contacts: [], clients: brandClients },
)[1];
assert.equal(selfParent.company?.parent, null);
const cleared = applyHubSpotContactsMapping(
  brandParsed,
  { ...brandMapping, companyParents: {} },
  { staff, contacts: [], clients: brandClients },
);
assert.ok(cleared.every((draft) => draft.company?.parent === null));
assert.equal(summarizeHubSpotContactDrafts(cleared).byParent.length, 0);

// A parent already on file is reused, and a company already under a parent keeps it.
const onFileClients: Client[] = [
  { id: "cl-kw", name: "Keller Williams", type: "realtor", city: "", state: "", notes: "" },
  { id: "cl-kw-plano", name: "Keller Williams Plano", type: "realtor", city: "", state: "", notes: "", parentClientId: "cl-kw" },
];
const onFileCsv = "First Name,Last Name,Email,Associated Company\nGus,Vale,gus@example.com,Keller Williams Plano\nHal,Wong,hal@example.com,KW Frisco\n";
const onFileParsed = parseHubSpotContactsCsv(onFileCsv);
const onFileMapping = defaultHubSpotContactsMapping(onFileParsed, staff, "s-bd", onFileClients);
assert.equal(onFileMapping.companyParents["KW Frisco"], "Keller Williams");
const [gus, hal] = applyHubSpotContactsMapping(onFileParsed, onFileMapping, { staff, contacts: [], clients: onFileClients });
assert.equal(gus.company?.existingId, "cl-kw-plano");
assert.equal(gus.company?.parent?.existingId, "cl-kw");
assert.equal(gus.company?.parent?.onFile, true);
assert.equal(hal.company?.parent?.existingId, "cl-kw");
assert.equal(hal.company?.parent?.onFile, false);
const onFileSummary = summarizeHubSpotContactDrafts([gus, hal]);
assert.equal(onFileSummary.newParents, 0);
assert.equal(onFileSummary.groupedCompanies, 2);
assert.equal(onFileSummary.byParent[0]?.existingId, "cl-kw");

// --- template ----------------------------------------------------------------------

const template = parseHubSpotContactsCsv(HUBSPOT_CONTACTS_TEMPLATE_CSV);
assert.equal(template.missingRequired.length, 0);
assert.equal(template.rows.length, 1);
assert.equal(Object.keys(template.columns).length, HUBSPOT_CONTACTS_TEMPLATE_HEADERS.length);
assert.equal(template.ignoredColumns.length, 0);

console.log("hubspot-contacts-import tests passed");
