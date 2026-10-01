import assert from "node:assert/strict";
import { clientFacingSharePayload } from "./client-proposal.ts";

const payload = clientFacingSharePayload({
  customer: "Shawn",
  estimate: {
    id: "e1",
    number: "EST-1",
    name: "Roof",
    status: "sent",
    createdAt: "2026-09-15",
    taxRate: 0,
    discountKind: "percent",
    discountValue: 0,
    depositKind: "percent",
    depositValue: 0,
    marginPercent: 25,
    hideLinePrices: false,
    shareToken: "sharetoken1234",
  },
  lines: [
    {
      id: "l1",
      estimateId: "e1",
      title: "Shingles",
      quantity: 1,
      unit: "LS",
      unitCost: 8000,
      optional: false,
      selected: true,
      taxable: true,
      photoIds: ["p1"],
      photos: [
        {
          id: "p1",
          imageUrl:
            "https://f005.backblazeb2.com/file/TheCRM/1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b/job-photos/47a117fd-e6c5-4c3c-a684-a4b93007e01f/shot.jpg",
          caption: "Rotted siding",
        },
      ],
    },
  ],
});

assert.ok(payload);
assert.equal(payload?.estimate.marginPercent, 0);
assert.equal(payload?.lines[0]?.unitCost, 10000);
assert.equal(payload?.lines[0]?.photos?.length, 1);
assert.match(payload?.lines[0]?.photos?.[0]?.imageUrl ?? "", /^\/api\/storage\/object\?/);
assert.doesNotMatch(payload?.lines[0]?.photos?.[0]?.imageUrl ?? "", /backblazeb2/);
assert.equal(payload?.lines[0]?.photos?.[0]?.imageUrl.includes("share=sharetoken1234"), true);
assert.deepEqual(payload?.files, []);

const companyId = "1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b";
const estimateId = "47a117fd-e6c5-4c3c-a684-a4b93007e01f";
const withFile = clientFacingSharePayload(
  {
    customer: "Shawn",
    estimate: {
      id: "e1",
      number: "EST-1",
      name: "Roof",
      status: "sent",
      createdAt: "2026-09-15",
      taxRate: 0,
      discountKind: "percent",
      discountValue: 0,
      depositKind: "percent",
      depositValue: 0,
      marginPercent: 0,
      hideLinePrices: true,
      shareToken: "sharetoken1234",
    },
    lines: [],
    files: [
      {
        id: "f1",
        name: "Warranty.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        storagePath: `${companyId}/estimate-files/${estimateId}/warranty.pdf`,
        url: `https://f005.backblazeb2.com/file/TheCRM/${companyId}/estimate-files/${estimateId}/warranty.pdf`,
        createdAt: "2026-09-20T12:00:00.000Z",
      },
    ],
  },
  "sharetoken1234",
);
assert.equal(withFile?.files.length, 1);
assert.equal(withFile?.files[0]?.name, "Warranty.pdf");
assert.match(withFile?.files[0]?.url ?? "", /^\/api\/storage\/object\?/);
assert.equal(withFile?.files[0]?.url.includes("share=sharetoken1234"), true);
assert.doesNotMatch(withFile?.files[0]?.url ?? "", /backblazeb2/);

const parsedAgain = clientFacingSharePayload(withFile, "sharetoken1234");
assert.equal(parsedAgain?.files[0]?.url.includes("share=sharetoken1234"), true);
assert.equal(parsedAgain?.estimate.marginPercent, 0);

console.log("client-proposal.test.ts ok");
