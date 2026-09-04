import type { JobPhoto, PhotoAuditAction, PhotoAuditEvent } from "@/lib/types";

export function isTrashedPhoto(photo: Pick<JobPhoto, "deletedAt">) {
  return Boolean(photo.deletedAt?.trim());
}

export function livePhotos(photos: JobPhoto[], jobId?: string) {
  return photos.filter((photo) => {
    if (isTrashedPhoto(photo)) return false;
    if (jobId && photo.jobId !== jobId) return false;
    return true;
  });
}

export function trashedPhotos(photos: JobPhoto[], jobId?: string) {
  return photos.filter((photo) => {
    if (!isTrashedPhoto(photo)) return false;
    if (jobId && photo.jobId !== jobId) return false;
    return true;
  });
}

export function parsePhotoAuditAction(value: unknown): PhotoAuditAction {
  return value === "restored" ? "restored" : "deleted";
}

export function mapPhotoAuditEvent(row: {
  id: string;
  job_id: string | null;
  photo_id: string;
  action: string;
  actor: string;
  actor_staff_id: string | null;
  caption: string;
  category: string;
  image_url: string;
  storage_path: string;
  detail: string;
  created_at: string;
}): PhotoAuditEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    photoId: row.photo_id,
    action: parsePhotoAuditAction(row.action),
    actor: row.actor ?? "",
    actorStaffId: row.actor_staff_id,
    caption: row.caption ?? "",
    category: row.category ?? "",
    imageUrl: row.image_url ?? "",
    storagePath: row.storage_path ?? "",
    detail: row.detail ?? "",
    createdAt: row.created_at,
  };
}
