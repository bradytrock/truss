import assert from "node:assert/strict";
import { cardAddressLines, cardCheckRow, cardMapsHref, cardWebsiteHost } from "./card-display.ts";

assert.equal(cardWebsiteHost("https://www.dallasroofer.com/about"), "DALLASROOFER.COM");
assert.equal(cardWebsiteHost("dallasroofer.com"), "DALLASROOFER.COM");
assert.equal(cardWebsiteHost("  "), "");

const address = cardAddressLines({
  street: "3001 Long Prairie Road, Suite 100",
  city: "Flower Mound",
  state: "TX",
  postalCode: "75022",
});
assert.equal(address.street, "3001 Long Prairie Road, Suite 100");
assert.equal(address.locality, "Flower Mound, TX 75022");
assert.equal(
  cardMapsHref(address),
  "https://www.google.com/maps/search/?api=1&query=3001%20Long%20Prairie%20Road%2C%20Suite%20100%2C%20Flower%20Mound%2C%20TX%2075022",
);
assert.equal(cardMapsHref({ street: "", locality: "" }), "");

assert.deepEqual(cardCheckRow("Checks payable to T Rock Roofing."), {
  title: "Check",
  detail: "Payable to T Rock Roofing",
});
assert.deepEqual(cardCheckRow("Payable to T-Rock Roofing"), {
  title: "Check",
  detail: "Payable to T-Rock Roofing",
});
assert.deepEqual(cardCheckRow("Check"), { title: "Check", detail: "" });
assert.deepEqual(cardCheckRow("Cash or card in the office."), {
  title: "Note",
  detail: "Cash or card in the office",
});
assert.equal(cardCheckRow("   "), null);
