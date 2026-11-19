import assert from "node:assert/strict";
import {
  draftCaptionFromTags,
  missingCaptionCount,
  parseCaptionTags,
  parsePhotoReportPages,
  photoFileLabel,
  photoFrameColumns,
  photoSection,
} from "./photo-report.ts";

assert.deepEqual(parseCaptionTags(["wear", "hail", "nope", "hail"]), ["hail", "wear"]);
assert.equal(draftCaptionFromTags(["overview"], "Front slope"), "Front slope overview.");
assert.equal(draftCaptionFromTags(["hail"], "Front slope"), "Hail impact.");
assert.equal(
  draftCaptionFromTags(["granule_loss", "hail"], "Front slope"),
  "Hail impact, with granule loss.",
);
assert.equal(
  draftCaptionFromTags(["overview", "hail"], "Front slope"),
  "Front slope overview, with hail impact.",
);
assert.equal(draftCaptionFromTags([], "Front slope"), "");

const pages = parsePhotoReportPages([
  {
    id: "cover",
    type: "cover",
    title: "Daniels",
    subtitle: "",
    notes: "",
    showAddress: true,
    showDate: true,
    showDateOfLoss: true,
    showClaimNumber: true,
    heroPhotoId: null,
    dateOfLoss: "",
    claimNumber: "",
  },
  {
    id: "slope",
    type: "photos",
    heading: "Front slope",
    notes: "Hail impacts found across the front slope.",
    layout: "four",
    frame: "grid",
    showCaptions: true,
    showTakenAt: false,
    showCategory: false,
    items: [
      { photoId: "a", caption: "Overview from the eave.", tags: ["overview"] },
      { photoId: "b", caption: "", tags: ["not-a-tag", "missing"] },
    ],
  },
]);

assert.equal(missingCaptionCount(pages), 1);
assert.equal(photoSection(pages, "slope").index, 0);
assert.equal(photoSection(pages, "slope").total, 1);
assert.equal(photoSection(pages, "cover").index, -1);
const sheet = pages[1];
assert.equal(sheet?.type === "photos" && sheet.items[1]?.tags?.join(","), "missing");
assert.equal(sheet?.type === "photos" && photoFrameColumns(sheet), 2);

const paired = parsePhotoReportPages([
  {
    id: "pair",
    type: "photos",
    heading: "Eave",
    notes: "",
    layout: "two",
    frame: "before_after",
    items: [],
  },
]);
const pair = paired[0];
assert.equal(pair?.type === "photos" && pair.frame, "before_after");
assert.equal(pair?.type === "photos" && photoFrameColumns(pair), 2);

assert.equal(photoFileLabel({ id: "photo-4106", storagePath: null }), "IMG_4106");
assert.equal(photoFileLabel({ id: "abc", storagePath: "jobs/IMG_2210.jpg" }), "IMG_2210");

console.log("photo-caption-tags.test.ts ok");
