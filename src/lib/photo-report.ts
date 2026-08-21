import type {
  Job,
  JobPhoto,
  PageTemplateId,
  PhotoPageLayout,
  PhotoReport,
  PhotoReportPage,
  PhotoReportPhotosPage,
} from "@/lib/types";

export const PHOTO_REPORTS_SQL = "supabase/migrations/20260821140000_photo_reports.sql";
export const PHOTO_REPORTS_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821140000_photo_reports.sql";
export const PAGE_SHARE_SQL = "supabase/migrations/20260821240000_page_share_tokens.sql";
export const PAGE_SHARE_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821240000_page_share_tokens.sql";

export const PAGE_TEMPLATE_OPTIONS: Array<{
  id: PageTemplateId;
  title: string;
  description: string;
}> = [
  {
    id: "photos",
    title: "Photo documentation",
    description: "Cover plus the photos already on this job. Send it to the homeowner or adjuster.",
  },
  {
    id: "inspection",
    title: "Inspection",
    description: "Cover, job photos, and a findings page for what you saw on site.",
  },
  {
    id: "completion",
    title: "Completion",
    description: "Closeout with after photos when you have them, plus a work-completed page.",
  },
  {
    id: "claim",
    title: "Claim",
    description: "Cover with date of loss and claim number, photos, and a damage-scope page.",
  },
  {
    id: "blank",
    title: "Blank",
    description: "Cover and an empty notes page. Build the rest yourself.",
  },
];

export function parsePageTemplate(value: unknown): PageTemplateId {
  if (value === "inspection" || value === "completion" || value === "claim" || value === "blank" || value === "photos") {
    return value;
  }
  return "photos";
}

export function pageCoverCopy(template: PageTemplateId): { kicker: string | null; reportTitle: string } {
  if (template === "inspection") return { kicker: "INSPECTION", reportTitle: "INSPECTION REPORT" };
  if (template === "completion") return { kicker: "COMPLETION", reportTitle: "COMPLETION REPORT" };
  if (template === "claim") return { kicker: "CLAIM", reportTitle: "CLAIM DOCUMENTATION" };
  if (template === "blank") return { kicker: "PAGE", reportTitle: "DOCUMENT" };
  return { kicker: null, reportTitle: "DOCUMENTATION REPORT" };
}

export function missingPhotoReportsMessage() {
  return `Saved on this device. Paste the Raw file ${PHOTO_REPORTS_SQL_RAW} in the SQL editor to keep photo reports in Postgres.`;
}

export function missingPageShareMessage() {
  return `Saved on this device. Paste the Raw file ${PAGE_SHARE_SQL_RAW} in the SQL editor so Pages can use a client share link.`;
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

export function isMissingPageShare(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    message.includes("share_token") ||
    message.includes("photo_reports.template") ||
    (message.includes("template") && message.includes("photo_reports")) ||
    message.includes("shared_page")
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
    dateOfLoss: input?.dateOfLoss ?? "",
    claimNumber: input?.claimNumber ?? "",
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

export function emptyTextPage(input?: { heading?: string; body?: string }): Extract<
  PhotoReportPage,
  { type: "text" }
> {
  return {
    id: newPageId(),
    type: "text",
    heading: input?.heading ?? "",
    body: input?.body ?? "",
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

function jobField(job: Job, match: RegExp) {
  return job.customFields.find((field) => match.test(field.label))?.value.trim() ?? "";
}

function photosForTemplate(template: PageTemplateId, photos: JobPhoto[]) {
  if (template !== "completion") return photos;
  const after = photos.filter((photo) => photo.category === "after");
  return after.length > 0 ? after : photos;
}

function titleForTemplate(template: PageTemplateId, jobName: string) {
  if (template === "inspection") return `${jobName} inspection`;
  if (template === "completion") return `${jobName} completion`;
  if (template === "claim") return `${jobName} claim documentation`;
  if (template === "blank") return `${jobName} page`;
  return `${jobName} photo report`;
}

export function createPhotoReport(input: {
  job: Job;
  customer: string;
  photos: JobPhoto[];
  author: string;
  template?: PageTemplateId;
}): PhotoReport {
  const now = new Date().toISOString();
  const template = parsePageTemplate(input.template);
  const photos = photosForTemplate(template, input.photos);
  const cover = emptyCoverPage({
    title: input.job.name,
    subtitle: input.customer,
    heroPhotoId: photos[0]?.id ?? input.photos[0]?.id ?? null,
    dateOfLoss: jobField(input.job, /date of loss|loss date/i),
    claimNumber: jobField(input.job, /claim/),
  });
  const pages: PhotoReportPage[] =
    template === "blank"
      ? [cover, emptyTextPage({ heading: "Notes" })]
      : template === "inspection"
        ? [...[cover], ...photosPagesFromPhotos(photos), emptyTextPage({ heading: "Findings" })]
        : template === "completion"
          ? [...[cover], ...photosPagesFromPhotos(photos), emptyTextPage({ heading: "Work completed" })]
          : template === "claim"
            ? [...[cover], ...photosPagesFromPhotos(photos), emptyTextPage({ heading: "Scope of damage" })]
            : [cover, ...photosPagesFromPhotos(photos)];
  return {
    id: crypto.randomUUID(),
    jobId: input.job.id,
    title: titleForTemplate(template, input.job.name),
    pages,
    template,
    shareToken: "",
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
        dateOfLoss: asString(row.dateOfLoss),
        claimNumber: asString(row.claimNumber),
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
