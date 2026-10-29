import assert from "node:assert/strict";
import {
  companyBrandKey,
  companyFamily,
  knownBrand,
  parentCandidates,
  suggestCompanyGroups,
} from "./company-groups.ts";
import type { Client } from "./types.ts";

// --- brand keys -----------------------------------------------------------------

assert.equal(companyBrandKey("Keller Williams Realty"), "keller williams");
assert.equal(companyBrandKey("Keller Williams Realty - Plano"), "keller williams");
assert.equal(companyBrandKey("EXP Realty, LLC"), "exp");
assert.equal(companyBrandKey("Compass Real Estate"), "compass");
assert.equal(companyBrandKey("Ebby Halliday Realtors of Frisco"), "ebby halliday");
assert.equal(companyBrandKey("Allied Adjusters"), "allied adjusters");
assert.equal(companyBrandKey("Realty"), "realty");
assert.equal(companyBrandKey(""), "");

assert.equal(knownBrand("KW Dallas Preston Road"), "Keller Williams");
assert.equal(knownBrand("eXp Realty of Texas"), "eXp Realty");
assert.equal(knownBrand("RE/MAX DFW Associates"), "RE/MAX");
assert.equal(knownBrand("State Farm - Jim Bell Agency"), "State Farm");
assert.equal(knownBrand("Progressive Roofing"), null);
assert.equal(knownBrand("Allied Adjusters"), null);

// --- suggestions from a file alone -------------------------------------------------

const file = [
  "Keller Williams",
  "Keller Williams Realty",
  "EXP Realty",
  "EXP Realty LLC",
  "Fathom Realty Frisco",
  "Fathom Realty Plano",
  "Lone Star Roofing Supply",
  "Allied Adjusters",
  "Allied Adjusters of Texas",
  "Summit Claims Group",
];
const groups = suggestCompanyGroups(file);

// A member that is the brand itself is the parent, not an office.
assert.equal(groups.get("Keller Williams"), undefined);
assert.equal(groups.get("Keller Williams Realty")?.parentName, "Keller Williams");
assert.equal(groups.get("Keller Williams Realty")?.known, true);
assert.equal(groups.get("Keller Williams Realty")?.existingParentId, null);

// Known franchise where one row is the brand itself: it is the parent, spelled the way the file spells it.
assert.equal(groups.get("EXP Realty"), undefined);
assert.equal(groups.get("EXP Realty LLC")?.parentName, "EXP Realty");
assert.deepEqual(groups.get("EXP Realty LLC")?.members, ["EXP Realty LLC"]);

// Known franchise with only offices: the canonical brand name is used.
const exp = suggestCompanyGroups(["eXp Realty of Texas", "EXP Realty LLC"]);
assert.equal(exp.get("eXp Realty of Texas")?.parentName, "eXp Realty");
assert.equal(exp.get("EXP Realty LLC")?.parentName, "eXp Realty");
assert.deepEqual(exp.get("EXP Realty LLC")?.members, ["eXp Realty of Texas", "EXP Realty LLC"]);

// Fathom is known too; two offices share one parent.
assert.equal(groups.get("Fathom Realty Frisco")?.parentName, "Fathom Realty");
assert.equal(groups.get("Fathom Realty Plano")?.parentName, "Fathom Realty");

// Unknown brand, one name is a word-prefix of the other: the short one is the parent.
assert.equal(groups.get("Allied Adjusters"), undefined);
assert.equal(groups.get("Allied Adjusters of Texas")?.parentName, "Allied Adjusters");
assert.equal(groups.get("Allied Adjusters of Texas")?.known, false);

// Standalone names stay alone.
assert.equal(groups.get("Lone Star Roofing Supply"), undefined);
assert.equal(groups.get("Summit Claims Group"), undefined);

// Unknown brand with a shared prefix across two offices builds the parent from the common words.
const offices = suggestCompanyGroups(["Blue Door Realty Frisco", "Blue Door Realty Plano, LLC"]);
assert.equal(offices.get("Blue Door Realty Frisco")?.parentName, "Blue Door Realty");
assert.equal(offices.get("Blue Door Realty Plano, LLC")?.parentName, "Blue Door Realty");
const apart = suggestCompanyGroups(["North Texas Roofing", "North Texas Adjusters", "Dallas Roofing Supply", "Dallas Roofing Pros"]);
assert.equal(apart.size, 0);

// --- suggestions against companies already on file ----------------------------------

const clients: Client[] = [
  { id: "cl-kw", name: "Keller Williams", type: "realtor", city: "Dallas", state: "TX", notes: "" },
  { id: "cl-kw-plano", name: "Keller Williams Plano", type: "realtor", city: "Plano", state: "TX", notes: "", parentClientId: "cl-kw" },
  { id: "cl-compass", name: "Compass Real Estate", type: "realtor", city: "Dallas", state: "TX", notes: "" },
  { id: "cl-allied", name: "Allied Adjusters", type: "insurance", city: "", state: "", notes: "" },
];

const onFile = suggestCompanyGroups(
  ["Keller Williams Realty", "Compass Real Estate", "Compass Real Estate LLC", "Allied Adjusters", "Allied Adjusters of Texas"],
  clients,
);

// An office already under a parent on file points its siblings at that parent.
assert.equal(onFile.get("Keller Williams Realty")?.parentName, "Keller Williams");
assert.equal(onFile.get("Keller Williams Realty")?.existingParentId, "cl-kw");

// Compass is a known brand; the parent "Compass" is new, the existing office rolls up under it.
assert.equal(onFile.get("Compass Real Estate")?.parentName, "Compass");
assert.equal(onFile.get("Compass Real Estate")?.existingParentId, null);
assert.equal(onFile.get("Compass Real Estate LLC")?.parentName, "Compass");

// The existing company is the parent of its longer-named sibling.
assert.equal(onFile.get("Allied Adjusters"), undefined);
assert.equal(onFile.get("Allied Adjusters of Texas")?.parentName, "Allied Adjusters");
assert.equal(onFile.get("Allied Adjusters of Texas")?.existingParentId, "cl-allied");

// The same company already on file, with nothing else like it, is not grouped.
const same = suggestCompanyGroups(["Allied Adjusters"], clients);
assert.equal(same.get("Allied Adjusters"), undefined);

// --- family and parent choices --------------------------------------------------------

assert.deepEqual(
  companyFamily(clients, "cl-kw").map((client) => client.id),
  ["cl-kw", "cl-kw-plano"],
);
assert.deepEqual(companyFamily(clients, "cl-kw-plano").map((client) => client.id), ["cl-kw-plano"]);
assert.deepEqual(companyFamily(clients, "missing"), []);
// Keller Williams cannot be put under its own office.
assert.deepEqual(
  parentCandidates(clients, "cl-kw").map((client) => client.id),
  ["cl-allied", "cl-compass"],
);

console.log("company-groups tests passed");
