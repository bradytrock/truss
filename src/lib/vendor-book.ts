import { formatPhone } from "@/lib/format";
import { contactMatchesQuery } from "@/lib/phone";
import type { QbVendor } from "@/lib/types";

export function vendorAddressLine(vendor: Pick<QbVendor, "street" | "street2" | "city" | "state" | "postalCode">) {
  const street = [vendor.street, vendor.street2].map((part) => part.trim()).filter(Boolean).join(", ");
  const cityState = [vendor.city, vendor.state].map((part) => part.trim()).filter(Boolean).join(", ");
  const line = [street, cityState, vendor.postalCode.trim()].filter(Boolean).join(" · ");
  return line;
}

export type VendorBookRow = {
  id: string;
  name: string;
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
  listId: string;
  isActive: boolean;
  statusLabel: "Active" | "Inactive";
  syncedAt: string;
};

export function buildVendorBookRow(vendor: QbVendor): VendorBookRow {
  const companyName = vendor.companyName.trim();
  const contact = vendor.contact.trim() || [vendor.firstName, vendor.lastName].filter(Boolean).join(" ").trim();
  const vendorType = vendor.vendorType.trim();
  return {
    id: vendor.id,
    name: vendor.name.trim(),
    companyName,
    contact,
    typeLine: vendorType || (companyName && companyName !== vendor.name.trim() ? companyName : "Vendor"),
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
    listId: vendor.listId.trim(),
    isActive: vendor.isActive,
    statusLabel: vendor.isActive ? "Active" : "Inactive",
    syncedAt: vendor.syncedAt,
  };
}

export function buildVendorBook(vendors: QbVendor[]) {
  return vendors
    .map(buildVendorBookRow)
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
}

export function vendorRowMatchesQuery(row: VendorBookRow, query: string) {
  return contactMatchesQuery(
    { name: row.name, title: row.typeLine, email: row.email, phone: row.phoneRaw },
    query,
    [row.address, row.companyName, row.contact, row.accountNumber, row.vendorType, row.notes],
  );
}

export function visibleVendorRows(rows: VendorBookRow[], query: string) {
  return rows.filter((row) => vendorRowMatchesQuery(row, query));
}
