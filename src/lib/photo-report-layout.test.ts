import assert from "node:assert/strict";
import { createPhotoReport, photoIndexStart, templateIncludesPhotos } from "./photo-report.ts";
import type { Job, JobPhoto } from "./types.ts";

const job = {
  id: "job_michael",
  name: "1248 Michael Ave",
  street: "1248 Michael Ave",
  city: "Denver",
  state: "CO",
  postalCode: "80204",
  location: "",
  primaryPhotoId: null,
  customFields: [],
} as unknown as Job;

function shot(id: string, caption: string): JobPhoto {
  return {
    id,
    jobId: job.id,
    caption,
    category: "before",
    takenAt: "2026-10-03",
    imageUrl: "",
    storagePath: null,
  };
}

const photos = ["South slope", "Ridge cap", "Valley", "Gutter", "Chimney"].map((caption, index) =>
  shot(`p${index + 1}`, caption),
);

const report = createPhotoReport({
  job,
  customer: "Homeowner",
  photos,
  author: "Brady",
  template: "photos",
  photoLayout: "four",
});

const sheets = report.pages.filter((page) => page.type === "photos");
assert.equal(sheets.length, 2);
assert.equal(sheets[0]?.type === "photos" && sheets[0].layout, "four");
assert.equal(sheets[0]?.type === "photos" && sheets[0].items.length, 4);
assert.equal(sheets[1]?.type === "photos" && sheets[1].items.length, 1);
assert.equal(sheets[1] ? photoIndexStart(report.pages, sheets[1].id) : 0, 5);

const stacked = createPhotoReport({
  job,
  customer: "Homeowner",
  photos: photos.slice(0, 2),
  author: "Brady",
  template: "inspection",
});
const stackedSheet = stacked.pages.find((page) => page.type === "photos");
assert.equal(stackedSheet?.type === "photos" && stackedSheet.layout, "two");
assert.equal(stacked.pages.at(-1)?.type, "text");

const claim = createPhotoReport({
  job,
  customer: "Homeowner",
  photos,
  author: "Brady",
  template: "claim",
  photoLayout: "one",
});
assert.equal(
  claim.pages.filter((page) => page.type === "photos").every((page) => page.type === "photos" && page.layout === "one"),
  true,
);

assert.equal(templateIncludesPhotos("photos"), true);
assert.equal(templateIncludesPhotos("inspection"), true);
assert.equal(templateIncludesPhotos("completion"), true);
assert.equal(templateIncludesPhotos("claim"), true);
assert.equal(templateIncludesPhotos("work_order"), false);
assert.equal(templateIncludesPhotos("blank"), false);

console.log("photo-report-layout.test.ts ok");
