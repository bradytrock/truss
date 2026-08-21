import { codeInsertError, isMissingCodeColumn, missingCodeColumnMessage, payloadWithoutCode } from "@/lib/job-code";
import {
  isInvalidEnumValue,
  isMissingPrimaryContactColumn,
  legacyProjectType,
  missingPrimaryContactHint,
  missingPrimaryContactMessage,
} from "@/lib/supabase/schema-errors";

export type SchemaError = { message?: string; code?: string };

const OVERVIEW_KEYS = [
  "description",
  "tags",
  "street",
  "city",
  "state",
  "postal_code",
  "sales_rep",
  "assigned",
  "subcontractor_ids",
  "related_contact_ids",
  "custom_fields",
  "project_type",
  "lead_source",
  "market",
] as const;

const FIRST_MIGRATION_KEYS = [
  "id",
  "company_id",
  "opportunity_id",
  "name",
  "client_id",
  "status",
  "contract_value",
  "start_date",
  "substantial_completion",
  "superintendent",
  "project_manager",
  "location",
] as const;

function omitKeys<T extends object>(row: T, keys: readonly string[]): T {
  const next = { ...row } as Record<string, unknown>;
  for (const key of keys) delete next[key];
  return next as T;
}

export function omitPrimaryContact<T extends object>(row: T): Omit<T, "primary_contact_id"> {
  return omitKeys(row, ["primary_contact_id"]) as Omit<T, "primary_contact_id">;
}

export function jobRowWithoutOverview<T extends object>(row: T): T {
  return omitKeys(omitPrimaryContact(row) as T, OVERVIEW_KEYS);
}

export function jobRowFirstMigration<T extends object>(row: T): Record<string, unknown> {
  const source = row as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of FIRST_MIGRATION_KEYS) {
    if (key in source) next[key] = source[key];
  }
  return next;
}

export function isJobSchemaMismatch(error: SchemaError | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    isMissingCodeColumn(error) ||
    isMissingPrimaryContactColumn(error)
  );
}

export function jobInsertError(error: SchemaError | null | undefined, fallback: string) {
  if (isMissingPrimaryContactColumn(error)) return missingPrimaryContactHint();
  return codeInsertError(error, fallback);
}

export function jobInsertRowVariants<T extends object>(row: T): T[] {
  const variants: T[] = [];
  const seen = new Set<string>();
  const add = (next: object) => {
    const record = next as Record<string, unknown>;
    const key = `${Object.keys(record).sort().join(",")}|${String(record.project_type ?? "")}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(next as T);
  };

  add(row);
  const typed = row as Record<string, unknown>;
  if (typeof typed.project_type === "string" && typed.project_type) {
    add({ ...typed, project_type: legacyProjectType(typed.project_type) });
  }
  if ("code" in typed) add(payloadWithoutCode(typed as T & { code?: string }));
  if ("primary_contact_id" in typed) add(omitPrimaryContact(row));
  if ("code" in typed && "primary_contact_id" in typed) {
    add(omitPrimaryContact(payloadWithoutCode(typed as T & { code?: string })));
  }
  add(jobRowWithoutOverview(row));
  const withoutOverview = jobRowWithoutOverview(row) as Record<string, unknown>;
  if ("code" in withoutOverview) add(payloadWithoutCode(withoutOverview as T & { code?: string }));
  add(jobRowFirstMigration(row));
  return variants;
}

function fallbackHint(firstError: SchemaError | null | undefined, original: object, used: object) {
  if (isMissingPrimaryContactColumn(firstError)) return missingPrimaryContactMessage();
  if (isMissingCodeColumn(firstError)) return missingCodeColumnMessage();
  if (!("primary_contact_id" in used) && "primary_contact_id" in original) {
    return missingPrimaryContactMessage();
  }
  if (!("code" in used) && "code" in original) return missingCodeColumnMessage();
  return undefined;
}

export async function insertJobWithFallbacks<T extends object, TData>(
  payload: T,
  insert: (row: T) => PromiseLike<{ data?: TData | null; error: SchemaError | null }>,
): Promise<{ data: TData | null; error: SchemaError | null; hint?: string }> {
  const variants = jobInsertRowVariants(payload);
  let firstMismatch: SchemaError | null = null;
  let lastError: SchemaError | null = null;
  for (let index = 0; index < variants.length; index += 1) {
    const result = await insert(variants[index]);
    if (!result.error) {
      return {
        data: result.data ?? null,
        error: null,
        hint: index === 0 ? undefined : fallbackHint(firstMismatch, payload, variants[index]),
      };
    }
    lastError = result.error;
    if (isJobSchemaMismatch(result.error) || isInvalidEnumValue(result.error)) {
      if (!firstMismatch) firstMismatch = result.error;
      continue;
    }
    return { data: result.data ?? null, error: result.error };
  }
  return { data: null, error: lastError };
}

export async function insertJobRowsWithFallbacks<T extends object>(
  rows: T[],
  insert: (rows: T[]) => PromiseLike<{ error: SchemaError | null }>,
): Promise<{ error: SchemaError | null; hint?: string }> {
  if (rows.length === 0) return { error: null };
  const variantCount = jobInsertRowVariants(rows[0]).length;
  let firstMismatch: SchemaError | null = null;
  let lastError: SchemaError | null = null;
  for (let index = 0; index < variantCount; index += 1) {
    const batch = rows.map((row) => jobInsertRowVariants(row)[index]);
    const result = await insert(batch);
    if (!result.error) {
      return {
        error: null,
        hint: index === 0 ? undefined : fallbackHint(firstMismatch, rows[0], batch[0]),
      };
    }
    lastError = result.error;
    if (isJobSchemaMismatch(result.error) || isInvalidEnumValue(result.error)) {
      if (!firstMismatch) firstMismatch = result.error;
      continue;
    }
    return { error: result.error };
  }
  return { error: lastError };
}
