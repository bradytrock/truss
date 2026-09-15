import assert from "node:assert/strict";
import {
  lookupQuery,
  nominatimSearchUrl,
  rankSuggestions,
  shouldSuggestAddress,
  suggestionFromFormattedAddress,
  suggestionFromGooglePrediction,
  suggestionFromNominatim,
} from "./address-suggest.ts";

assert.equal(shouldSuggestAddress("914 S"), true);
assert.equal(shouldSuggestAddress("914"), false);
assert.equal(lookupQuery("914 Shadow Ridge", { state: "TX" }), "914 Shadow Ridge, TX");
assert.equal(lookupQuery("914 Shadow Ridge, TX", { state: "TX" }), "914 Shadow Ridge, TX");
assert.equal(lookupQuery("914 Shadow Ridge, Texas", { state: "TX" }), "914 Shadow Ridge, Texas");
assert.equal(
  lookupQuery("914 Shadow Ridge", { city: "Highland Village", state: "TX" }),
  "914 Shadow Ridge, Highland Village, TX",
);

const house = suggestionFromNominatim({
  place_id: 1,
  display_name: "914, Shadow Ridge Drive, Highland Village, Denton County, Texas, 75077, United States",
  address: {
    house_number: "914",
    road: "Shadow Ridge Drive",
    town: "Highland Village",
    state: "Texas",
    "ISO3166-2-lvl4": "US-TX",
    postcode: "75077",
    country_code: "us",
  },
});
assert.deepEqual(house, {
  id: "1",
  label: "914 Shadow Ridge Drive, Highland Village, TX, 75077",
  street: "914 Shadow Ridge Drive",
  city: "Highland Village",
  state: "TX",
  postalCode: "75077",
});

const formatted = suggestionFromFormattedAddress(
  "p1",
  "914 Shadow Ridge Drive, Highland Village, TX 75077, USA",
  "914 Shadow Ridge Drive",
);
assert.deepEqual(formatted, {
  id: "p1",
  label: "914 Shadow Ridge Drive, Highland Village, TX, 75077",
  street: "914 Shadow Ridge Drive",
  city: "Highland Village",
  state: "TX",
  postalCode: "75077",
});

const google = suggestionFromGooglePrediction({
  placeId: "ChIJ",
  text: { text: "100 Main Street, Plano, TX 75074, United States" },
  structuredFormat: {
    mainText: { text: "100 Main Street" },
    secondaryText: { text: "Plano, TX 75074, United States" },
  },
});
assert.equal(google?.street, "100 Main Street");
assert.equal(google?.city, "Plano");
assert.equal(google?.state, "TX");
assert.equal(google?.postalCode, "75074");

const ranked = rankSuggestions([
  { id: "a", label: "Main", street: "Main", city: "Plano", state: "TX", postalCode: "" },
  { id: "b", label: "100 Main", street: "100 Main", city: "Plano", state: "TX", postalCode: "75074" },
  { id: "c", label: "dup", street: "100 Main", city: "Plano", state: "TX", postalCode: "75074" },
]);
assert.equal(ranked.length, 2);
assert.equal(ranked[0]?.street, "100 Main");

const url = nominatimSearchUrl("914 Shadow Ridge, TX", "TX");
assert.equal(url.searchParams.get("countrycodes"), "us");
assert.equal(url.searchParams.get("viewbox")?.includes("-97"), false);
assert.ok(url.searchParams.get("viewbox")?.includes("-106.65"));

assert.equal(suggestionFromNominatim({ address: { country_code: "ca", road: "King" } }), null);

console.log("address-suggest.test.ts ok");
