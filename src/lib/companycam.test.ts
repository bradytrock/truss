import assert from "node:assert/strict";
import {
  asCompanyCamList,
  companyCamCapturedDate,
  companyCamCapturedUnix,
  companyCamListedPhotoId,
  companyCamPhotoCreateBody,
  companyCamPhotoIdsToDrop,
  companyCamPhotoPageState,
  companyCamProjectBody,
  companyCamUploadUrl,
  companyCamSignature,
  companyCamSignatureMatches,
  companyCamTokenHint,
  companyCamWebhookUrl,
  formatCompanyCamAddress,
  isCompanyCamImageUrl,
  jobHasCompanyCamAddress,
  looksLikeCompanyCamToken,
  parseCompanyCamCompany,
  parseCompanyCamPhoto,
  parseCompanyCamProject,
  parseCompanyCamWebhook,
} from "./companycam.ts";

assert.equal(looksLikeCompanyCamToken("a".repeat(20)), true);
assert.equal(looksLikeCompanyCamToken("short"), false);
assert.equal(looksLikeCompanyCamToken(`${"a".repeat(20)} token`), false);
assert.equal(looksLikeCompanyCamToken(`https://example.com/${"a".repeat(20)}`), false);
assert.equal(companyCamTokenHint("companycam-token-91af"), "91af");

const token = "c".repeat(48);
assert.equal(
  companyCamWebhookUrl("https://app.truss.test/", token),
  `https://app.truss.test/api/companycam/webhook?token=${token}`,
);

const body = JSON.stringify({ event_type: "photo.created" });
const signature = companyCamSignature(token, body);
assert.equal(companyCamSignatureMatches(token, body, signature), true);
assert.equal(companyCamSignatureMatches(token, body, `${signature}x`), false);
assert.equal(companyCamSignatureMatches(token, `${body} `, signature), false);

assert.deepEqual(parseCompanyCamCompany({ id: "2789583992", name: "Northwind Roofing", status: "active" }), {
  id: "2789583992",
  name: "Northwind Roofing",
});
assert.equal(parseCompanyCamCompany({ id: "1" }), null);

assert.equal(
  formatCompanyCamAddress({
    street_address_1: "808 P St",
    street_address_2: "Suite 2",
    city: "Lincoln",
    state: "NE",
    postal_code: "68508",
  }),
  "808 P St Suite 2, Lincoln, NE 68508",
);

const project = parseCompanyCamProject({
  id: 42,
  name: "Smith residence",
  address: { street_address_1: "100 Main", city: "Plano", state: "TX", postal_code: "75074" },
});
assert.equal(project?.id, "42");
assert.equal(project?.address, "100 Main, Plano, TX 75074");
assert.equal(project?.url, "https://app.companycam.com/projects/42");

const photo = parseCompanyCamPhoto({
  id: "8675309",
  project_id: 99,
  creator_name: "Ada",
  captured_at: 1_152_230_396,
  uris: [
    { type: "thumbnail", url: "https://static.companycam.com/shot-small.jpg" },
    { type: "original", uri: "https://static.companycam.com/shot.jpg" },
    { type: "web", url: "https://static.companycam.com/shot-web.jpg" },
  ],
});
assert.equal(photo?.url, "https://static.companycam.com/shot-web.jpg");
assert.equal(photo?.projectId, "99");
assert.equal(photo?.caption, "CompanyCam · Ada");
assert.equal(photo?.takenOn, companyCamCapturedDate(1_152_230_396));
assert.equal(parseCompanyCamPhoto({ id: "1", uris: [{ type: "web", url: "https://evil.example/shot.jpg" }] }), null);
assert.equal(isCompanyCamImageUrl("http://static.companycam.com/shot.jpg"), false);

const event = parseCompanyCamWebhook({
  event_type: "photo.created",
  payload: {
    photo: {
      id: "5",
      uris: [{ type: "original", url: "https://img.companycam.com/a.jpg" }],
    },
    project: { id: "77" },
  },
});
assert.equal(event.eventType, "photo.created");
assert.equal(event.photo?.projectId, "77");
assert.equal(parseCompanyCamWebhook({ event_type: "project.created", payload: { id: "1" } }).photo, null);

const removed = parseCompanyCamWebhook({
  event_type: "photo.deleted",
  payload: { id: "55", project_id: "77" },
});
assert.equal(removed.eventType, "photo.deleted");
assert.equal(removed.photo?.id, "55");
assert.equal(removed.photo?.projectId, "77");
assert.equal(removed.photo?.url, "");

assert.equal(companyCamUploadUrl("https://files.example.com/roof.jpg"), "https://files.example.com/roof.jpg");
assert.equal(companyCamUploadUrl("https://static.companycam.com/shot.jpg"), "");
assert.equal(companyCamUploadUrl("http://files.example.com/roof.jpg"), "");
assert.equal(companyCamCapturedUnix("2026-09-29T00:00:00.000Z"), Math.floor(Date.parse("2026-09-29T00:00:00.000Z") / 1000));
assert.deepEqual(
  companyCamPhotoCreateBody({
    uri: "https://files.example.com/roof.jpg",
    capturedAt: "2026-09-29T00:00:00.000Z",
    description: "Front slope",
  }),
  {
    photo: {
      uri: "https://files.example.com/roof.jpg",
      captured_at: companyCamCapturedUnix("2026-09-29T00:00:00.000Z"),
      description: "Front slope",
    },
  },
);
assert.deepEqual(companyCamPhotoIdsToDrop(["a", "b", ""], ["b"], true), ["a"]);
assert.deepEqual(companyCamPhotoIdsToDrop(["a"], [], false), []);

assert.deepEqual(
  companyCamPhotoPageState({ rawCount: 50, nextCursor: "cursor-2", hasNext: "true", page: 1, previousCursor: "" }),
  { mode: "cursor", cursor: "cursor-2", page: 1, complete: false },
);
assert.deepEqual(
  companyCamPhotoPageState({ rawCount: 100, nextCursor: "", hasNext: "false", page: 3, previousCursor: "cursor-2" }),
  { mode: "stop", cursor: "", page: 3, complete: true },
);
assert.deepEqual(
  companyCamPhotoPageState({ rawCount: 100, nextCursor: "", hasNext: "true", page: 1, previousCursor: "" }),
  { mode: "stop", cursor: "", page: 1, complete: false },
);
assert.deepEqual(
  companyCamPhotoPageState({ rawCount: 50, nextCursor: "", hasNext: "", page: 1, previousCursor: "" }),
  { mode: "page", cursor: "", page: 2, complete: false },
);
assert.deepEqual(
  companyCamPhotoPageState({ rawCount: 0, nextCursor: "", hasNext: "", page: 2, previousCursor: "" }),
  { mode: "stop", cursor: "", page: 2, complete: true },
);
assert.equal(companyCamListedPhotoId({ id: 8675309, status: "active" }), "8675309");
assert.equal(companyCamListedPhotoId({ id: "55", status: "deleted" }), "");
assert.equal(companyCamListedPhotoId({ status: "active" }), "");

assert.deepEqual(asCompanyCamList({ projects: [{ id: "1" }] }), [{ id: "1" }]);

const created = companyCamProjectBody({
  name: "Smith",
  street: "100 Main",
  city: "Plano",
  state: "TX",
  postalCode: "75074",
  lat: 33.01,
  lng: -96.7,
});
assert.equal((created.coordinates as { lon: number }).lon, -96.7);
assert.equal(
  jobHasCompanyCamAddress({ street: "100 Main", city: "Plano", state: "TX", postalCode: "75074" }),
  true,
);
assert.equal(jobHasCompanyCamAddress({ street: "100 Main", city: "", state: "TX", postalCode: "" }), false);
