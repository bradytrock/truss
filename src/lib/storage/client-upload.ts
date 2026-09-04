"use client";

export type StorageKind =
  | "job-files"
  | "job-photos"
  | "receipts"
  | "company-assets";

export type UploadedObject = {
  path: string;
  publicUrl: string;
  contentType: string;
  size: number;
  bucket: string;
};

/** Upload a file through the authenticated B2 proxy. `path` is company-relative (no kind prefix). */
export async function uploadViaApi(
  kind: StorageKind,
  file: File | Blob,
  path: string,
  fileName?: string,
): Promise<UploadedObject> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("path", path);
  if (file instanceof File) {
    form.set("file", file);
  } else {
    form.set("file", file, fileName || "upload.bin");
  }

  const res = await fetch("/api/storage/upload", {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    storagePath?: string;
    path?: string;
    url?: string;
    publicUrl?: string;
    contentType?: string;
    size?: number;
    bucket?: string;
  };
  const storagePath = json.storagePath || json.path;
  const publicUrl = json.url || json.publicUrl;
  if (!res.ok || !storagePath || !publicUrl) {
    throw new Error(json.error || "Upload failed");
  }
  return {
    path: storagePath,
    publicUrl,
    contentType: json.contentType || "application/octet-stream",
    size: json.size || 0,
    bucket: json.bucket || `b2:${kind}`,
  };
}

export async function deleteViaApi(path: string, kind?: StorageKind): Promise<void> {
  if (!path.trim()) return;
  const res = await fetch("/api/storage/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, kind }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || "Delete failed");
  }
}
