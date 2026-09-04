export const STORAGE_KINDS = [
  "job-files",
  "job-photos",
  "receipts",
  "company-assets",
] as const;

export type StorageKind = (typeof STORAGE_KINDS)[number];

export function isStorageKind(value: string): value is StorageKind {
  return (STORAGE_KINDS as readonly string[]).includes(value);
}
