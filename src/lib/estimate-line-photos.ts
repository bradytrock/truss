import { uniqueIds } from "@/lib/job-record";
import type { EstimateLine, EstimateLinePhoto, JobPhoto } from "@/lib/types";

export const MAX_LINE_PHOTOS = 8;

export function normalizeLinePhotoIds(ids: string[] | null | undefined) {
  return uniqueIds((ids ?? []).map((id) => String(id))).slice(0, MAX_LINE_PHOTOS);
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
    if (fromLine?.imageUrl) {
      return [{ id: fromLine.id, imageUrl: fromLine.imageUrl, caption: fromLine.caption ?? "" }];
    }
    const fromGallery = galleryById.get(id);
    if (fromGallery?.imageUrl) {
      return [
        {
          id: fromGallery.id,
          imageUrl: fromGallery.imageUrl,
          caption: fromGallery.caption ?? "",
        },
      ];
    }
    return [];
  });
}
