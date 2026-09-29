import assert from "node:assert/strict";
import { PRODUCT_NAME } from "./product.ts";
import { estimateSharePreview } from "./share-preview.ts";

const summit = estimateSharePreview({
  company: { name: "Summit Roofing" },
  estimate: {
    name: "Roof replacement",
    street: "4418 E 32nd Ave",
    city: "Denver",
    state: "CO",
    postalCode: "80205",
  },
});

assert.equal(summit.title, "4418 E 32nd Ave, Denver, CO 80205");
assert.equal(summit.description, "Proposal from Summit Roofing");
assert.equal(summit.siteName, "Summit Roofing");
assert.equal(summit.title.includes(PRODUCT_NAME), false);
assert.equal(summit.description.includes(PRODUCT_NAME), false);

const streetOnly = estimateSharePreview({
  company: { name: "Summit Roofing" },
  estimate: { name: "Proposal", street: "100 Main St", city: "", state: "", postalCode: "" },
});
assert.equal(streetOnly.title, "100 Main St");

const named = estimateSharePreview({
  company: { name: "Summit Roofing" },
  estimate: { name: "Roof replacement", street: "", city: "", state: "", postalCode: "" },
});
assert.equal(named.title, "Roof replacement");
assert.equal(named.description, "Proposal from Summit Roofing");

const generic = estimateSharePreview({
  company: { name: "Summit Roofing" },
  estimate: { name: "Untitled proposal", street: "  ", city: "", state: "", postalCode: "" },
});
assert.equal(generic.title, "Proposal from Summit Roofing");

const bare = estimateSharePreview({
  company: { name: "" },
  estimate: { name: "Proposal", street: "", city: "", state: "", postalCode: "" },
});
assert.equal(bare.title, "Proposal");
assert.equal(bare.description, "Proposal");
assert.equal(bare.siteName, "");

console.log("share-preview.test.ts ok");
