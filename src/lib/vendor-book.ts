import { formatPhone } from "@/lib/format";
import { contactMatchesQuery } from "@/lib/phone";
import type { Expense, MaterialOrder, QbVendor, VendorFeedback, VendorPrice, VendorProfile } from "@/lib/types";
import { planVendorDirectory, vendorNameKey, vendorProfileName } from "@/lib/vendor-profile";

export function vendorAddressLine(vendor: Pick<QbVendor, "street" | "street2" | "city" | "state" | "postalCode">) {
  const street = [vendor.street, vendor.street2].map((part) => part.trim()).filter(Boolean).join(", ");
  const cityState = [vendor.city, vendor.state].map((part) => part.trim()).filter(Boolean).join(", ");
  const line = [street, cityState, vendor.postalCode.trim()].filter(Boolean).join(" · ");
  return line;
}

export type VendorKind = "quickbooks" | "trade" | "payee";

export type VendorBookRow = {
  id: string;
  name: string;
  nameKey: string;
  kind: VendorKind;
  companyName: string;
  contact: string;
  typeLine: string;
  address: string;
  phone: string;
  phoneRaw: string;
  altPhone: string;
  fax: string;
  email: string;
  accountNumber: string;
  vendorType: string;
  terms: string;
  taxId: string;
  creditLimit: string;
  balance: string;
  notes: string;
  internalNotes: string;
  profileId: string | null;
  feedbackCount: number;
  priceCount: number;
  listId: string;
  isActive: boolean;
  statusLabel: "Active" | "Inactive" | "On file";
  syncedAt: string;
};

export function vendorDirectoryId(input: { qbId?: string | null; profileId?: string | null; nameKey: string }) {
  return input.qbId || input.profileId || `name:${encodeURIComponent(input.nameKey)}`;
}

export function buildVendorBookRow(
  vendor: QbVendor,
  extras?: { profile?: VendorProfile | null; feedbackCount?: number; priceCount?: number },
): VendorBookRow {
  const companyName = vendor.companyName.trim();
  const contact = vendor.contact.trim() || [vendor.firstName, vendor.lastName].filter(Boolean).join(" ").trim();
  const vendorType = vendor.vendorType.trim();
  const name = vendor.name.trim();
  return {
    id: vendor.id,
    name,
    nameKey: vendorNameKey(name),
    kind: "quickbooks",
    companyName,
    contact,
    typeLine: vendorType || (companyName && companyName !== name ? companyName : "Vendor"),
    address: vendorAddressLine(vendor),
    phone: formatPhone(vendor.phone),
    phoneRaw: vendor.phone.trim(),
    altPhone: formatPhone(vendor.altPhone),
    fax: vendor.fax.trim(),
    email: vendor.email.trim(),
    accountNumber: vendor.accountNumber.trim(),
    vendorType,
    terms: vendor.terms.trim(),
    taxId: vendor.taxId.trim(),
    creditLimit: vendor.creditLimit.trim(),
    balance: vendor.balance.trim(),
    notes: vendor.notes.trim(),
    internalNotes: extras?.profile?.notes.trim() ?? "",
    profileId: extras?.profile?.id ?? null,
    feedbackCount: extras?.feedbackCount ?? 0,
    priceCount: extras?.priceCount ?? 0,
    listId: vendor.listId.trim(),
    isActive: vendor.isActive,
    statusLabel: vendor.isActive ? "Active" : "Inactive",
    syncedAt: vendor.syncedAt,
  };
}

function emptyVendorRow(name: string, kind: VendorKind, typeLine: string): VendorBookRow {
  const trimmed = vendorProfileName(name);
  const nameKey = vendorNameKey(trimmed);
  return {
    id: vendorDirectoryId({ nameKey }),
    name: trimmed,
    nameKey,
    kind,
    companyName: "",
    contact: "",
    typeLine,
    address: "",
    phone: "—",
    phoneRaw: "",
    altPhone: "—",
    fax: "",
    email: "",
    accountNumber: "",
    vendorType: "",
    terms: "",
    taxId: "",
    creditLimit: "",
    balance: "",
    notes: "",
    internalNotes: "",
    profileId: null,
    feedbackCount: 0,
    priceCount: 0,
    listId: "",
    isActive: true,
    statusLabel: "On file",
    syncedAt: "",
  };
}

export function buildVendorBook(
  vendors: QbVendor[],
  extras?: {
    profiles?: VendorProfile[];
    feedback?: VendorFeedback[];
    prices?: VendorPrice[];
    expenses?: Expense[];
    materialOrders?: MaterialOrder[];
    tradeNames?: string[];
  },
) {
  const vendorsByKey = new Map(vendors.map((vendor) => [vendorNameKey(vendor.name), vendor]));
  const tradeKeys = new Set((extras?.tradeNames ?? []).map((name) => vendorNameKey(name)).filter(Boolean));
  const planned = planVendorDirectory({
    qbVendors: vendors,
    profiles: extras?.profiles,
    feedback: extras?.feedback,
    prices: extras?.prices,
    extraNames: [
      ...(extras?.tradeNames ?? []).map((name) => ({ name, kind: "trade" as const })),
      ...(extras?.expenses ?? []).map((item) => ({ name: item.vendor, kind: "payee" as const })),
      ...(extras?.materialOrders ?? []).map((item) => ({ name: item.vendor, kind: "payee" as const })),
    ],
  });

  return planned
    .map((entry) => {
      const vendor = entry.qbId ? vendors.find((item) => item.id === entry.qbId) : vendorsByKey.get(entry.nameKey);
      if (vendor) {
        return buildVendorBookRow(vendor, {
          profile: entry.profileId
            ? {
                id: entry.profileId,
                name: entry.name,
                nameKey: entry.nameKey,
                notes: entry.internalNotes,
                updatedBy: "",
                updatedAt: "",
                createdAt: "",
              }
            : null,
          feedbackCount: entry.feedbackCount,
          priceCount: entry.priceCount,
        });
      }
      const fromTrade = entry.kind === "trade" || tradeKeys.has(entry.nameKey);
      const row = emptyVendorRow(
        entry.name,
        fromTrade ? "trade" : entry.kind,
        fromTrade ? "Subcontractor" : "Used on jobs",
      );
      row.id = entry.profileId || row.id;
      row.profileId = entry.profileId;
      row.internalNotes = entry.internalNotes;
      row.feedbackCount = entry.feedbackCount;
      row.priceCount = entry.priceCount;
      return row;
    })
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
}

export function vendorRowMatchesQuery(row: VendorBookRow, query: string) {
  return contactMatchesQuery(
    { name: row.name, title: row.typeLine, email: row.email, phone: row.phoneRaw },
    query,
    [row.address, row.companyName, row.contact, row.accountNumber, row.vendorType, row.notes, row.internalNotes],
  );
}

export function visibleVendorRows(rows: VendorBookRow[], query: string) {
  return rows.filter((row) => vendorRowMatchesQuery(row, query));
}
