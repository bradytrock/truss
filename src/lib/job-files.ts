import type { Job, JobCustomField, JobFile } from "@/lib/types";

export const JOB_FILE_FIELD_LABEL = "__truss_file__";

export function isJobFileField(field: JobCustomField) {
  return field.label === JOB_FILE_FIELD_LABEL;
}

export function visibleJobCustomFields(fields: JobCustomField[]) {
  return fields.filter((field) => !isJobFileField(field));
}

export function encodeJobFileField(file: JobFile): JobCustomField {
  return {
    id: file.id,
    label: JOB_FILE_FIELD_LABEL,
    value: JSON.stringify({
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      url: file.url,
      storagePath: file.storagePath,
      createdBy: file.createdBy,
      createdAt: file.createdAt,
      bucket: file.bucket ?? "job-files",
    }),
  };
}

export function parseJobFileField(field: JobCustomField, jobId: string): JobFile | null {
  if (!isJobFileField(field)) return null;
  try {
    const raw = JSON.parse(field.value) as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name : "";
    const url = typeof raw.url === "string" ? raw.url : "";
    if (!name || !url) return null;
    return {
      id: field.id,
      jobId,
      name,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "",
      sizeBytes: Number(raw.sizeBytes) || 0,
      url,
      storagePath: typeof raw.storagePath === "string" ? raw.storagePath : "",
      createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      bucket: typeof raw.bucket === "string" ? raw.bucket : "job-files",
    };
  } catch {
    return null;
  }
}

export function jobFilesFromJobs(jobs: Job[]): JobFile[] {
  return jobs.flatMap((job) =>
    job.customFields.flatMap((field) => {
      const file = parseJobFileField(field, job.id);
      return file ? [file] : [];
    }),
  );
}

export function mergeJobFiles(primary: JobFile[], extra: JobFile[]) {
  const seen = new Set(primary.map((file) => file.id));
  return [...primary, ...extra.filter((file) => !seen.has(file.id))];
}

export function withJobFileField(fields: JobCustomField[], file: JobFile) {
  return [...fields.filter((field) => field.id !== file.id), encodeJobFileField(file)];
}

export function withoutJobFileId(fields: JobCustomField[], id: string) {
  return fields.filter((field) => field.id !== id);
}

export function isPdfFile(file: Pick<File, "name" | "type">) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isImageFile(file: Pick<File, "name" | "type">) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
}

export function isMissingStorageBucket(error: { message?: string; code?: string; statusCode?: string | number } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = String(error.code ?? error.statusCode ?? "").toLowerCase();
  return (
    code === "nosuchbucket" ||
    code === "404" ||
    message.includes("bucket not found") ||
    message.includes("no such bucket")
  );
}

export function readFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
