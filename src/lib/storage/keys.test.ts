import assert from "node:assert/strict";
import { objectKeyFromStoredPath, storageObjectKey } from "./keys.ts";

const company = "1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b";

assert.equal(
  storageObjectKey(company, "company-files", "file-id.pdf"),
  `${company}/company-files/file-id.pdf`,
);
assert.equal(
  storageObjectKey(company, "job-files", `${company}/job-files/job/file.pdf`),
  `${company}/job-files/job/file.pdf`,
);
assert.equal(
  storageObjectKey(company, "job-photos", `job-photos/${company}/shot.jpg`),
  `${company}/job-photos/shot.jpg`,
);

assert.equal(
  objectKeyFromStoredPath(`azure:thecrm/${company}/job-files/a.pdf`, { azureContainer: "thecrm" }),
  `${company}/job-files/a.pdf`,
);
assert.equal(
  objectKeyFromStoredPath(`b2:TheCRM/${company}/receipts/a.jpg`, { b2Bucket: "TheCRM" }),
  `${company}/receipts/a.jpg`,
);
assert.equal(
  objectKeyFromStoredPath(`${company}/company-files/a.pdf`, { azureContainer: "thecrm" }),
  `${company}/company-files/a.pdf`,
);

console.log("keys.test.ts ok");
