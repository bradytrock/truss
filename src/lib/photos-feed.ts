import { localYmd } from "@/lib/format";
import { namesMatch } from "@/lib/seats";
import {
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  type Contact,
  type Job,
  type JobPhoto,
  type PhotoCategory,
  type StaffMember,
} from "@/lib/types";

function parseTakenAt(iso: string) {
  if (iso.includes("T")) return new Date(iso);
  return new Date(`${iso}T12:00:00`);
}

export function photoDayKey(iso: string) {
  return localYmd(parseTakenAt(iso));
}

export function photoDayLabel(ymd: string) {
  return parseTakenAt(ymd).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function photoTimeLabel(iso: string) {
  if (!iso.includes("T")) return "";
  return parseTakenAt(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function photoJobLabel(job: Job | undefined, contact: Contact | undefined) {
  if (contact?.name) return contact.name;
  if (job?.name) return job.name;
  return "Job photo";
}

export type PhotoFeedItem = {
  photo: JobPhoto;
  job?: Job;
  contact?: Contact;
  label: string;
  photographer: string;
};

/** Who took the shot — never the job owner or homeowner unless they are stored on the photo. */
export function resolvePhotoPhotographer(photo: JobPhoto, staff: StaffMember[]): string {
  const raw = photo.createdBy?.trim() ?? "";
  if (!raw) return "";
  const byId = staff.find((member) => member.id === raw);
  if (byId) return byId.name;
  const byName = staff.find((member) => namesMatch(member.name, raw));
  if (byName) return byName.name;
  return raw;
}

export function photoFeedTitle(item: PhotoFeedItem): string {
  const caption = item.photo.caption.trim();
  if (caption) return caption;
  if (item.photographer) return item.photographer;
  return `${PHOTO_CATEGORY_LABELS[item.photo.category]} photo`;
}

export function photoFeedTakenBy(photographer: string) {
  return photographer ? `Taken by ${photographer}` : "";
}

export type PhotoDateRange = "all" | "today" | "7d" | "30d" | "month";

export function photoInDateRange(iso: string, range: PhotoDateRange) {
  if (range === "all") return true;
  const taken = parseTakenAt(iso);
  taken.setHours(12, 0, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((today.getTime() - taken.getTime()) / 86_400_000);
  if (range === "today") return diff === 0;
  if (range === "7d") return diff >= 0 && diff <= 7;
  if (range === "30d") return diff >= 0 && diff <= 30;
  return taken.getMonth() === today.getMonth() && taken.getFullYear() === today.getFullYear();
}

export type PhotoSort = "newest" | "oldest" | "tag";

export const PHOTO_SORT_LABELS: Record<PhotoSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  tag: "By tag",
};

export function photoTagRank(category: PhotoCategory) {
  const index = PHOTO_CATEGORIES.indexOf(category);
  return index === -1 ? PHOTO_CATEGORIES.length : index;
}

export function comparePhotosBySort(
  a: Pick<JobPhoto, "category" | "takenAt">,
  b: Pick<JobPhoto, "category" | "takenAt">,
  sort: PhotoSort,
) {
  if (sort === "tag") {
    const tagDiff = photoTagRank(a.category) - photoTagRank(b.category);
    if (tagDiff !== 0) return tagDiff;
  }
  const timeA = parseTakenAt(a.takenAt).getTime();
  const timeB = parseTakenAt(b.takenAt).getTime();
  return sort === "oldest" ? timeA - timeB : timeB - timeA;
}

export function sortPhotos<T extends Pick<JobPhoto, "category" | "takenAt">>(photos: T[], sort: PhotoSort) {
  return [...photos].sort((a, b) => comparePhotosBySort(a, b, sort));
}

export type PhotoViewerGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

export function groupPhotosByDay(items: PhotoFeedItem[]) {
  return groupPhotoFeed(items, "newest").map((group) => ({
    day: group.key,
    label: group.label,
    items: group.items,
  }));
}

export function groupPhotoFeed(items: PhotoFeedItem[], sort: PhotoSort): PhotoViewerGroup<PhotoFeedItem>[] {
  return groupTaggedPhotos(items, sort, (item) => item.photo);
}

export function groupJobPhotos(photos: JobPhoto[], sort: PhotoSort): PhotoViewerGroup<JobPhoto>[] {
  return groupTaggedPhotos(photos, sort, (photo) => photo);
}

function groupTaggedPhotos<T>(
  items: T[],
  sort: PhotoSort,
  photoOf: (item: T) => Pick<JobPhoto, "category" | "takenAt">,
): PhotoViewerGroup<T>[] {
  const sorted = [...items].sort((a, b) => comparePhotosBySort(photoOf(a), photoOf(b), sort));
  if (sort === "tag") {
    const groups = new Map<PhotoCategory, T[]>();
    for (const item of sorted) {
      const category = photoOf(item).category;
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    }
    return PHOTO_CATEGORIES.filter((category) => groups.has(category)).map((category) => ({
      key: category,
      label: PHOTO_CATEGORY_LABELS[category],
      items: groups.get(category)!,
    }));
  }

  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const item of sorted) {
    const key = photoDayKey(photoOf(item).takenAt);
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  return order.map((day) => ({ key: day, label: photoDayLabel(day), items: groups.get(day)! }));
}

export const PHOTO_DATE_RANGE_LABELS: Record<PhotoDateRange, string> = {
  all: "Any date",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

export const PHOTO_TAG_FILTERS: Array<{ value: "all" | PhotoCategory; label: string }> = [
  { value: "all", label: "All tags" },
  { value: "before", label: "Before" },
  { value: "progress", label: "Progress" },
  { value: "after", label: "After" },
  { value: "issue", label: "Issue" },
];
