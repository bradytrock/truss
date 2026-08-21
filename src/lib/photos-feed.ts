import { localYmd } from "@/lib/format";
import type { Contact, Job, JobPhoto, PhotoCategory } from "@/lib/types";

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

export type PhotoFeedItem = {
  photo: JobPhoto;
  job?: Job;
  contact?: Contact;
  label: string;
  photographer: string;
};

export function groupPhotosByDay(items: PhotoFeedItem[]) {
  const order: string[] = [];
  const groups = new Map<string, PhotoFeedItem[]>();
  const sorted = [...items].sort(
    (a, b) => parseTakenAt(b.photo.takenAt).getTime() - parseTakenAt(a.photo.takenAt).getTime(),
  );
  for (const item of sorted) {
    const key = photoDayKey(item.photo.takenAt);
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  return order.map((day) => ({ day, label: photoDayLabel(day), items: groups.get(day)! }));
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
