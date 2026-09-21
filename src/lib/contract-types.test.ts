import assert from "node:assert/strict";
import { DEFAULT_ESTIMATE_TERMS } from "./estimate-totals.ts";
import {
  addCompanyContractType,
  companyEstimateTermsFor,
  contractTypesFromCompany,
  defaultContractType,
  normalizeContractTypes,
  parseContractTypes,
  patchCompanyContractType,
  removeCompanyContractType,
  setDefaultCompanyContractType,
  withSyncedDefaultEstimateTerms,
} from "./contract-types.ts";

assert.equal(parseContractTypes(null).length, 0);
assert.equal(parseContractTypes("nope").length, 0);

const parsed = parseContractTypes([
  { id: "a", name: " Residential ", body: "Res body", isDefault: true },
  { id: "a", name: "Dup", body: "skip" },
  { id: "b", name: "Commercial", body: "Com body", isDefault: false },
]);
assert.equal(parsed.length, 2);
assert.equal(parsed[0]?.name, "Residential");

const fromEmpty = contractTypesFromCompany({ defaultEstimateTerms: null, contractTypes: [] });
assert.equal(fromEmpty.length, 1);
assert.equal(fromEmpty[0]?.name, "Standard");
assert.equal(fromEmpty[0]?.isDefault, true);
assert.equal(fromEmpty[0]?.body, DEFAULT_ESTIMATE_TERMS);

const fromLegacy = contractTypesFromCompany({
  defaultEstimateTerms: "Legacy company contract",
  contractTypes: [],
});
assert.equal(fromLegacy[0]?.body, "Legacy company contract");

const two = addCompanyContractType(fromLegacy, { name: "Insurance" });
assert.equal(two.length, 2);
assert.equal(two[1]?.name, "Insurance");
assert.equal(two[1]?.body, "Legacy company contract");
assert.equal(two.filter((type) => type.isDefault).length, 1);

const promoted = setDefaultCompanyContractType(two, two[1]!.id);
assert.equal(defaultContractType(promoted).id, two[1]!.id);
assert.equal(companyEstimateTermsFor({ contractTypes: promoted, defaultEstimateTerms: null }, two[1]!.id), "Legacy company contract");

const renamed = patchCompanyContractType(promoted, two[1]!.id, {
  name: "Insurance claim",
  body: "Claim language",
});
assert.equal(defaultContractType(renamed).name, "Insurance claim");
assert.equal(defaultContractType(renamed).body, "Claim language");

const stillTwo = removeCompanyContractType(renamed, renamed[0]!.id);
assert.equal(stillTwo.length, 1);
assert.equal(stillTwo[0]?.isDefault, true);
assert.deepEqual(removeCompanyContractType(stillTwo, stillTwo[0]!.id), stillTwo);

const synced = withSyncedDefaultEstimateTerms({
  defaultEstimateTerms: "old",
  contractTypes: renamed,
});
assert.equal(synced.defaultEstimateTerms, "Claim language");
assert.equal(synced.contractTypes?.length, 2);

const normalized = normalizeContractTypes([
  { id: "x", name: "A", body: "a", isDefault: true },
  { id: "y", name: "B", body: "b", isDefault: true },
]);
assert.equal(normalized.filter((type) => type.isDefault).length, 1);
assert.equal(normalized[0]?.isDefault, true);
