import assert from "node:assert/strict";
import { withStorageShareAccess } from "./share-access.ts";

const token = "sharetoken1234";
const proxy =
  "/api/storage/object?path=1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b%2Fjob-photos%2F47a117fd-e6c5-4c3c-a684-a4b93007e01f%2Fshot.jpg";
const b2 =
  "https://f005.backblazeb2.com/file/TheCRM/1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b/job-photos/47a117fd-e6c5-4c3c-a684-a4b93007e01f/shot.jpg";

const fromProxy = withStorageShareAccess(proxy, token);
assert.equal(fromProxy.includes("share=sharetoken1234"), true);
assert.match(fromProxy, /^\/api\/storage\/object\?/);

const fromB2 = withStorageShareAccess(b2, token);
assert.doesNotMatch(fromB2, /backblazeb2/);
assert.match(fromB2, /^\/api\/storage\/object\?/);
assert.equal(fromB2.includes("share=sharetoken1234"), true);

assert.equal(withStorageShareAccess("data:image/png;base64,abc", token), "data:image/png;base64,abc");

console.log("share-access.test.ts ok");
