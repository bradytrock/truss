import assert from "node:assert/strict";
import {
  comparePhotosBySort,
  groupJobPhotos,
  groupPhotoFeed,
  groupPhotosByDay,
  photoTagRank,
  sortPhotos,
  type PhotoFeedItem,
} from "./photos-feed.ts";
import type { JobPhoto, PhotoCategory } from "./types.ts";

function photo(partial: Pick<JobPhoto, "id" | "category" | "takenAt"> & Partial<JobPhoto>): JobPhoto {
  return {
    jobId: "job_1",
    caption: partial.caption ?? partial.id,
    imageUrl: "/photo.jpg",
    storagePath: null,
    ...partial,
  };
}

function feed(partial: Pick<JobPhoto, "id" | "category" | "takenAt">): PhotoFeedItem {
  return {
    photo: photo(partial),
    label: partial.id,
    photographer: "Sam",
  };
}

assert.equal(photoTagRank("before"), 0);
assert.equal(photoTagRank("progress"), 1);
assert.equal(photoTagRank("after"), 2);
assert.equal(photoTagRank("issue"), 3);

const mixed = [
  photo({ id: "after-old", category: "after", takenAt: "2026-07-01" }),
  photo({ id: "before-new", category: "before", takenAt: "2026-09-01" }),
  photo({ id: "issue-mid", category: "issue", takenAt: "2026-08-01" }),
  photo({ id: "progress-new", category: "progress", takenAt: "2026-09-10" }),
];

assert.deepEqual(
  sortPhotos(mixed, "newest").map((item) => item.id),
  ["progress-new", "before-new", "issue-mid", "after-old"],
);
assert.deepEqual(
  sortPhotos(mixed, "oldest").map((item) => item.id),
  ["after-old", "issue-mid", "before-new", "progress-new"],
);
assert.deepEqual(
  sortPhotos(mixed, "tag").map((item) => item.id),
  ["before-new", "progress-new", "after-old", "issue-mid"],
);

assert.ok(comparePhotosBySort(mixed[1], mixed[3], "tag") < 0);
assert.ok(comparePhotosBySort(mixed[3], mixed[0], "newest") < 0);
assert.ok(comparePhotosBySort(mixed[0], mixed[3], "oldest") < 0);

const feedItems = mixed.map((item) => feed(item));
const newestGroups = groupPhotosByDay(feedItems);
assert.equal(newestGroups[0]?.day, "2026-09-10");
assert.deepEqual(
  newestGroups.flatMap((group) => group.items.map((item) => item.photo.id)),
  ["progress-new", "before-new", "issue-mid", "after-old"],
);

const tagGroups = groupPhotoFeed(feedItems, "tag");
assert.deepEqual(
  tagGroups.map((group) => group.key),
  ["before", "progress", "after", "issue"],
);
assert.deepEqual(
  tagGroups.map((group) => group.label),
  ["Before", "Progress", "After", "Issue"],
);

const oldestGroups = groupPhotoFeed(feedItems, "oldest");
assert.equal(oldestGroups[0]?.key, "2026-07-01");
assert.equal(oldestGroups.at(-1)?.key, "2026-09-10");

const jobGroups = groupJobPhotos(
  [photo({ id: "p1", category: "issue" as PhotoCategory, takenAt: "2026-09-02" }), photo({ id: "p2", category: "before", takenAt: "2026-09-01" })],
  "tag",
);
assert.deepEqual(
  jobGroups.map((group) => [group.key, group.items.map((item) => item.id)]),
  [
    ["before", ["p2"]],
    ["issue", ["p1"]],
  ],
);

console.log("photos-feed.test.ts ok");
