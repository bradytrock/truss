import {
  COMPANY_FILE_CATEGORIES,
  COMPANY_FILE_CATEGORY_LABELS,
  type CompanyFile,
  type CompanyFileCategory,
} from "@/lib/types";

export function isCompanyFileCategory(value: unknown): value is CompanyFileCategory {
  return (
    typeof value === "string" &&
    (COMPANY_FILE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function parseCompanyFileCategory(value: unknown): CompanyFileCategory {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isCompanyFileCategory(raw) ? raw : "other";
}

export function companyFileCategoryLabel(value: unknown) {
  const category = parseCompanyFileCategory(value);
  return COMPANY_FILE_CATEGORY_LABELS[category];
}

export function fillCompanyFile(file: Partial<CompanyFile> & Pick<CompanyFile, "id">): CompanyFile {
  const createdAt = typeof file.createdAt === "string" ? file.createdAt : "";
  return {
    id: file.id,
    name: typeof file.name === "string" && file.name.trim() ? file.name : "Untitled",
    category: parseCompanyFileCategory(file.category),
    mimeType:
      typeof file.mimeType === "string" && file.mimeType.trim()
        ? file.mimeType
        : "application/octet-stream",
    sizeBytes: Number(file.sizeBytes) || 0,
    url: typeof file.url === "string" ? file.url : "",
    storagePath: typeof file.storagePath === "string" ? file.storagePath : "",
    notes: typeof file.notes === "string" ? file.notes : "",
    createdBy: typeof file.createdBy === "string" ? file.createdBy : "",
    createdAt,
    updatedAt: typeof file.updatedAt === "string" && file.updatedAt ? file.updatedAt : createdAt,
    ...(file.bucket ? { bucket: file.bucket } : {}),
  };
}

export function companyFilesList(value: unknown): CompanyFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<CompanyFile> & Pick<CompanyFile, "id"> => {
      return Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string");
    })
    .map(fillCompanyFile);
}

export function companyFileSearchText(file: CompanyFile) {
  return `${file.name} ${file.notes} ${companyFileCategoryLabel(file.category)}`.toLowerCase();
}
