import assert from "node:assert/strict";
import { photosForEstimateLine, resolveEstimateLinePhotoUrl } from "./estimate-line-photos.ts";

const b2 =
  "https://f005.backblazeb2.com/file/TheCRM/1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b/job-photos/47a117fd-e6c5-4c3c-a684-a4b93007e01f/shot.jpg";

assert.equal(
  resolveEstimateLinePhotoUrl({ imageUrl: b2 }),
  "/api/storage/object?path=1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b%2Fjob-photos%2F47a117fd-e6c5-4c3c-a684-a4b93007e01f%2Fshot.jpg",
);

const fromGallery = photosForEstimateLine(
  { photoIds: ["p1"] },
  [
    {
      id: "p1",
      jobId: "j1",
      caption: "Rotted siding",
      category: "progress",
      takenAt: "2026-09-21",
      imageUrl: b2,
      storagePath:
        "1a5cc5ce-18d4-4ea9-9bc8-50b636e1c21b/job-photos/47a117fd-e6c5-4c3c-a684-a4b93007e01f/shot.jpg",
      createdBy: "",
    },
  ],
);
assert.equal(fromGallery.length, 1);
assert.equal(fromGallery[0]?.caption, "Rotted siding");
assert.match(fromGallery[0]?.imageUrl ?? "", /^\/api\/storage\/object\?path=/);
assert.doesNotMatch(fromGallery[0]?.imageUrl ?? "", /backblazeb2/);

const fromEmbedded = photosForEstimateLine({
  photoIds: ["p2"],
  photos: [{ id: "p2", imageUrl: b2, caption: "Front" }],
});
assert.equal(fromEmbedded.length, 1);
assert.match(fromEmbedded[0]?.imageUrl ?? "", /^\/api\/storage\/object\?path=/);

assert.deepEqual(photosForEstimateLine({ photoIds: ["missing"] }), []);

console.log("estimate-line-photos.test.ts ok");
