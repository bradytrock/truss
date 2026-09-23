import type { StorageKind } from "@/lib/storage/kinds";

export function fileExtensionFromName(name: string) {
  const rawExt = name.split(".").pop()?.toLowerCase() ?? "";
  return rawExt && rawExt.length <= 8 && /^[a-z0-9]+$/.test(rawExt) ? rawExt : "bin";
}

export function documentFileRelativePath(parentId: string, fileId: string, name: string) {
  return `${parentId}/${fileId}.${fileExtensionFromName(name)}`;
}

export type CopiedStorageObject = {
  storagePath: string;
  url: string;
  bucket?: string;
};

/** Copy a company-owned B2 object into another document folder (job, estimate, or invoice). */
export async function copyCompanyFileViaApi(
  source: { storagePath: string; mimeType: string },
  kind: Extract<StorageKind, "job-files" | "estimate-files" | "invoice-files">,
  relativePath: string,
): Promise<CopiedStorageObject> {
  const response = await fetch("/api/storage/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromPath: source.storagePath,
      kind,
      path: relativePath,
      contentType: source.mimeType,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
    storagePath?: string;
    path?: string;
    url?: string;
    publicUrl?: string;
    bucket?: string;
  };
  const storagePath = json.storagePath || json.path || "";
  if (!response.ok || !storagePath) {
    throw new Error(json.error || "Could not copy that file from the directory.");
  }
  return {
    storagePath,
    url: json.url || json.publicUrl || "",
    bucket: json.bucket,
  };
}
