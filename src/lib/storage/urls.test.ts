import assert from "node:assert/strict";
import {
  legacyKindlessObjectKey,
  resolveStoredFileUrl,
  storedObjectKeyCandidates,
} from "./urls.ts";

const company = "1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b";
const uploadId = "abc53393-50da-4eb1-9ba8-97a84fedb974";
const file = "6371c5fa-1b14-4e21-8262-e64801db7eb1.jpg";
const kindless = `${company}/${uploadId}/${file}`;
const canonical = `${company}/job-photos/${uploadId}/${file}`;
const b2 = `https://f005.backblazeb2.com/file/TheCRM/${canonical}`;

assert.equal(legacyKindlessObjectKey(canonical), kindless);
assert.equal(legacyKindlessObjectKey(kindless), "");

const candidates = storedObjectKeyCandidates({
  storagePath: kindless,
  url: b2,
  kind: "job-photos",
});
assert.deepEqual(candidates, [canonical]);

const resolved = resolveStoredFileUrl({
  storagePath: kindless,
  url: b2,
  kind: "job-photos",
});
assert.equal(resolved, `/api/storage/object?path=${encodeURIComponent(canonical)}`);
assert.doesNotMatch(resolved, /backblazeb2/);

const newer = resolveStoredFileUrl({
  storagePath: `${company}/job-photos/47a117fd-e6c5-4c3c-a684-a4b93007e01f/shot.jpg`,
  url: "/api/storage/object?path=ignored",
  kind: "job-photos",
});
assert.match(newer, /job-photos%2F47a117fd-e6c5-4c3c-a684-a4b93007e01f/);

console.log("urls.test.ts ok");
