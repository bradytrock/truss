import type {
  Job,
  JobPhoto,
  PhotoPageLayout,
  PhotoReport,
  PhotoReportPage,
  PhotoReportPhotosPage,
} from "@/lib/types";

export const PHOTO_REPORTS_SQL = "supabase/migrations/20260821140000_photo_reports.sql";
export const PHOTO_REPORTS_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821140000_photo_reports.sql";

export function missingPhotoReportsMessage() {
  return `Saved on this device. Paste the Raw file ${PHOTO_REPORTS_SQL_RAW} in the SQL editor to keep photo reports in Postgres.`;
}

export function isMissingPhotoReports(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("photo_reports")
  );
}

export function layoutCapacity(layout: PhotoPageLayout) {
  if (layout === "one") return 1;
  if (layout === "two") return 2;
  return 4;
}

export function newPageId() {
  return crypto.randomUUID();
}

export function emptyCoverPage(input?: Partial<Extract<PhotoReportPage, { type: "cover" }>>): Extract<
  PhotoReportPage,
  { type: "cover" }
> {
  return {
    id: input?.id || newPageId(),
    type: "cover",
    title: input?.title ?? "",
    subtitle: input?.subtitle ?? "",
    notes: input?.notes ?? "",
    showAddress: input?.showAddress ?? true,
    showDate: input?.showDate ?? true,
    heroPhotoId: input?.heroPhotoId ?? null,
  };
}

export function emptyPhotosPage(layout: PhotoPageLayout = "two"): PhotoReportPhotosPage {
  return {
    id: newPageId(),
    type: "photos",
    heading: "",
    layout,
    showCaptions: true,
    showTakenAt: true,
    showCategory: false,
    items: [],
  };
}

export function emptyTextPage(): Extract<PhotoReportPage, { type: "text" }> {
  return {
    id: newPageId(),
    type: "text",
    heading: "",
    body: "",
  };
}

export function pageLabel(page: PhotoReportPage, index: number) {
  if (page.type === "cover") return page.title.trim() || "Cover";
  if (page.type === "text") return page.heading.trim() || `Notes · page ${index + 1}`;
  if (page.heading.trim()) return page.heading.trim();
  const count = page.items.length;
  return count === 1 ? "1 photo" : `${count} photos`;
}

export function photosPagesFromPhotos(
  photos: JobPhoto[],
  layout: PhotoPageLayout = "two",
): PhotoReportPhotosPage[] {
  const cap = layoutCapacity(layout);
  if (photos.length === 0) return [emptyPhotosPage(layout)];
  const pages: PhotoReportPhotosPage[] = [];
  for (let index = 0; index < photos.length; index += cap) {
    const slice = photos.slice(index, index + cap);
    pages.push({
      ...emptyPhotosPage(layout),
      items: slice.map((photo) => ({ photoId: photo.id, caption: photo.caption })),
    });
  }
  return pages;
}

export function createPhotoReport(input: {
  job: Job;
  customer: string;
  photos: JobPhoto[];
  author: string;
}): PhotoReport {
  const now = new Date().toISOString();
  const title = `${input.job.name} photo report`;
  return {
    id: crypto.randomUUID(),
    jobId: input.job.id,
    title,
    pages: [
      emptyCoverPage({
        title: input.job.name,
        subtitle: input.customer,
        heroPhotoId: input.photos[0]?.id ?? null,
      }),
      ...photosPagesFromPhotos(input.photos),
    ],
    createdAt: now,
    updatedAt: now,
    createdBy: input.author,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function parseLayout(value: unknown): PhotoPageLayout {
  if (value === "one" || value === "two" || value === "four") return value;
  return "two";
}

export function parsePhotoReportPages(raw: unknown): PhotoReportPage[] {
  if (!Array.isArray(raw)) return [];
  const pages: PhotoReportPage[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = asString(row.id, newPageId());
    if (row.type === "cover") {
      pages.push({
        id,
        type: "cover",
        title: asString(row.title),
        subtitle: asString(row.subtitle),
        notes: asString(row.notes),
        showAddress: asBool(row.showAddress, true),
        showDate: asBool(row.showDate, true),
        heroPhotoId: asString(row.heroPhotoId) || null,
      });
      continue;
    }
    if (row.type === "text") {
      pages.push({
        id,
        type: "text",
        heading: asString(row.heading),
        body: asString(row.body),
      });
      continue;
    }
    if (row.type === "photos") {
      const items = Array.isArray(row.items)
        ? row.items
            .map((item) => asRecord(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
            .map((item) => ({
              photoId: asString(item.photoId),
              caption: asString(item.caption),
            }))
            .filter((item) => item.photoId)
        : [];
      pages.push({
        id,
        type: "photos",
        heading: asString(row.heading),
        layout: parseLayout(row.layout),
        showCaptions: asBool(row.showCaptions, true),
        showTakenAt: asBool(row.showTakenAt, true),
        showCategory: asBool(row.showCategory, false),
        items,
      });
    }
  }
  return pages;
}

export function photoById(photos: JobPhoto[], id: string | null | undefined) {
  if (!id) return undefined;
  return photos.find((photo) => photo.id === id);
}
