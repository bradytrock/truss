import { DEFAULT_ESTIMATE_TERMS } from "@/lib/estimate-totals";
import type { CompanyContractType, CompanySettings } from "@/lib/types";

export type { CompanyContractType };

export function newContractTypeId() {
  return crypto.randomUUID();
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

export function parseContractTypes(raw: unknown): CompanyContractType[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const types: CompanyContractType[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = asString(row.id).trim() || newContractTypeId();
    if (seen.has(id)) continue;
    seen.add(id);
    types.push({
      id,
      name: asString(row.name).trim() || "Contract",
      body: asString(row.body),
      isDefault: asBool(row.isDefault, false),
    });
  }
  return types;
}

export function normalizeContractTypes(
  types: CompanyContractType[],
  fallbackBody = DEFAULT_ESTIMATE_TERMS,
): CompanyContractType[] {
  const next =
    types.length > 0
      ? types.map((type, index) => ({
          ...type,
          id: type.id.trim() || newContractTypeId(),
          name: type.name.trim() || `Contract ${index + 1}`,
          body: type.body,
          isDefault: Boolean(type.isDefault),
        }))
      : [
          {
            id: "standard",
            name: "Standard",
            body: fallbackBody,
            isDefault: true,
          },
        ];
  const defaultIndex = next.findIndex((type) => type.isDefault);
  return next.map((type, index) => ({
    ...type,
    isDefault: defaultIndex >= 0 ? index === defaultIndex : index === 0,
  }));
}

export function contractTypesFromCompany(
  company?: Pick<CompanySettings, "defaultEstimateTerms" | "contractTypes"> | null,
): CompanyContractType[] {
  const fallback = company?.defaultEstimateTerms?.trim() || DEFAULT_ESTIMATE_TERMS;
  return normalizeContractTypes(company?.contractTypes ?? [], fallback);
}

export function defaultContractType(types: CompanyContractType[]) {
  return types.find((type) => type.isDefault) ?? types[0] ?? normalizeContractTypes([])[0]!;
}

export function contractTypeById(types: CompanyContractType[], id?: string | null) {
  const key = id?.trim() ?? "";
  if (!key) return undefined;
  return types.find((type) => type.id === key);
}

export function companyHasConfiguredEstimateTerms(
  company?: Pick<CompanySettings, "defaultEstimateTerms" | "contractTypes"> | null,
) {
  if (company?.defaultEstimateTerms?.trim()) return true;
  return (company?.contractTypes ?? []).some((type) => type.body.trim());
}

export function companyEstimateTermsFor(
  company?: Pick<CompanySettings, "defaultEstimateTerms" | "contractTypes"> | null,
  contractTypeId?: string | null,
) {
  const configured = company?.contractTypes ?? [];
  const match = contractTypeById(configured, contractTypeId);
  if (match?.body.trim()) return match.body;
  const fallback = company?.defaultEstimateTerms?.trim() ?? "";
  if (fallback) return fallback;
  const named = configured.find((type) => type.isDefault) ?? configured[0];
  if (named?.body.trim()) return named.body;
  return "";
}

export function addCompanyContractType(
  types: CompanyContractType[],
  input?: Partial<Pick<CompanyContractType, "name" | "body">>,
): CompanyContractType[] {
  const current = normalizeContractTypes(types);
  const source = defaultContractType(current);
  return [
    ...current,
    {
      id: newContractTypeId(),
      name: input?.name?.trim() || "New contract",
      body: input?.body ?? source.body,
      isDefault: false,
    },
  ];
}

export function removeCompanyContractType(types: CompanyContractType[], id: string): CompanyContractType[] {
  const current = normalizeContractTypes(types);
  if (current.length <= 1) return current;
  return normalizeContractTypes(current.filter((type) => type.id !== id));
}

export function setDefaultCompanyContractType(types: CompanyContractType[], id: string): CompanyContractType[] {
  return normalizeContractTypes(
    normalizeContractTypes(types).map((type) => ({ ...type, isDefault: type.id === id })),
  );
}

export function patchCompanyContractType(
  types: CompanyContractType[],
  id: string,
  patch: Partial<Pick<CompanyContractType, "name" | "body" | "isDefault">>,
): CompanyContractType[] {
  const current = normalizeContractTypes(types).map((type) =>
    type.id === id ? { ...type, ...patch, id: type.id } : type,
  );
  return normalizeContractTypes(current);
}

export function withSyncedDefaultEstimateTerms<
  T extends Pick<CompanySettings, "defaultEstimateTerms" | "contractTypes">,
>(company: T): T {
  const types = contractTypesFromCompany(company);
  return {
    ...company,
    contractTypes: types,
    defaultEstimateTerms: defaultContractType(types).body,
  };
}
