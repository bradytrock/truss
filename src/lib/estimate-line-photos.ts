import { uniqueIds } from "./job-record";
import { resolveStoredFileUrl } from "./storage/urls";
import type { EstimateLine, EstimateLinePhoto, JobPhoto } from "./types";

export const MAX_LINE_PHOTOS = 8;

export function normalizeLinePhotoIds(ids: string[] | null | undefined) {
  return uniqueIds((ids ?? []).map((id) => String(id))).slice(0, MAX_LINE_PHOTOS);
}

export function resolveEstimateLinePhotoUrl(photo: {
  imageUrl?: string | null;
  storagePath?: string | null;
}) {
  return resolveStoredFileUrl({
    storagePath: photo.storagePath,
    url: photo.imageUrl,
    kind: "job-photos",
  });
}

export function photosForEstimateLine(
  line: Pick<EstimateLine, "photoIds"> & { photos?: EstimateLinePhoto[] },
  gallery: JobPhoto[] = [],
): EstimateLinePhoto[] {
  const embedded = new Map((line.photos ?? []).map((photo) => [photo.id, photo]));
  const galleryById = new Map(gallery.map((photo) => [photo.id, photo]));
  const ids = line.photoIds.length
    ? line.photoIds
    : (line.photos ?? []).map((photo) => photo.id);
  return uniqueIds(ids).flatMap((id) => {
    const fromLine = embedded.get(id);
    const fromGallery = galleryById.get(id);
    const imageUrl =
      resolveEstimateLinePhotoUrl(fromLine ?? {}) || resolveEstimateLinePhotoUrl(fromGallery ?? {});
    if (!imageUrl) return [];
    return [
      {
        id,
        imageUrl,
        caption: fromLine?.caption ?? fromGallery?.caption ?? "",
        storagePath: fromLine?.storagePath ?? fromGallery?.storagePath ?? null,
      },
    ];
  });
}
