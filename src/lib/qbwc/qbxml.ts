import { xmlAttr, xmlEscape } from "@/lib/qbwc/xml";

/** QuickBooks Desktop customer/job Name max length. */
export const QB_NAME_MAX = 41;
/** RefNumber on InvoiceAdd is short in older company files. */
export const QB_REF_MAX = 11;

export function qbName(value: string, max = QB_NAME_MAX) {
  const cleaned = value
    .replace(/[:\t\n\r]/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Customer").slice(0, max);
}

export function customerJobFullName(customerName: string, jobCode: string) {
  return `${qbName(customerName)}:${qbName(jobCode || "Job")}`;
}

export function qbDate(value: string) {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10);
}

export function qbMoney(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

export function qbQty(value: number) {
  if (!Number.isFinite(value) || value === 0) return "1";
  return String(Math.round(value * 10000) / 10000);
}

export function wrapQbxml(body: string) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\r\n` +
    `<?qbxml version="13.0"?>\r\n` +
    `<QBXML>\r\n` +
    `  <QBXMLMsgsRq onError="stopOnError">\r\n` +
    `${body}` +
    `  </QBXMLMsgsRq>\r\n` +
    `</QBXML>`
  );
}

export function customerQueryXml(fullName: string, requestId: string) {
  return wrapQbxml(
    `    <CustomerQueryRq requestID="${xmlEscape(requestId)}">\r\n` +
      `      <FullName>${xmlEscape(fullName)}</FullName>\r\n` +
      `    </CustomerQueryRq>\r\n`,
  );
}

export function customerAddXml(input: {
  requestId: string;
  name: string;
  parentFullName?: string;
  companyName?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}) {
  const address = addressXml(input);
  const parent = input.parentFullName
    ? `      <ParentRef>\r\n        <FullName>${xmlEscape(input.parentFullName)}</FullName>\r\n      </ParentRef>\r\n`
    : "";
  const phone = input.phone?.trim()
    ? `      <Phone>${xmlEscape(input.phone.trim().slice(0, 21))}</Phone>\r\n`
    : "";
  const company = input.companyName?.trim()
    ? `      <CompanyName>${xmlEscape(qbName(input.companyName, 41))}</CompanyName>\r\n`
    : "";
  return wrapQbxml(
    `    <CustomerAddRq requestID="${xmlEscape(input.requestId)}">\r\n` +
      `      <CustomerAdd>\r\n` +
      `      <Name>${xmlEscape(qbName(input.name))}</Name>\r\n` +
      parent +
      `      <IsActive>true</IsActive>\r\n` +
      company +
      phone +
      address +
      `      </CustomerAdd>\r\n` +
      `    </CustomerAddRq>\r\n`,
  );
}

export function itemQueryXml(name: string, requestId: string) {
  return wrapQbxml(
    `    <ItemServiceQueryRq requestID="${xmlEscape(requestId)}">\r\n` +
      `      <FullName>${xmlEscape(name)}</FullName>\r\n` +
      `    </ItemServiceQueryRq>\r\n`,
  );
}

export function itemServiceAddXml(name: string, requestId: string) {
  const item = xmlEscape(qbName(name));
  return wrapQbxml(
    `    <ItemServiceAddRq requestID="${xmlEscape(requestId)}">\r\n` +
      `      <ItemServiceAdd>\r\n` +
      `        <Name>${item}</Name>\r\n` +
      `        <SalesOrPurchase>\r\n` +
      `          <Desc>${item}</Desc>\r\n` +
      `          <Price>0.00</Price>\r\n` +
      `          <AccountRef>\r\n` +
      `            <FullName>Construction Income</FullName>\r\n` +
      `          </AccountRef>\r\n` +
      `        </SalesOrPurchase>\r\n` +
      `      </ItemServiceAdd>\r\n` +
      `    </ItemServiceAddRq>\r\n`,
  );
}

export type QbInvoiceLine = {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

export type QbInvoiceAddInput = {
  requestId: string;
  customerJobFullName: string;
  refNumber: string;
  txnDate: string;
  dueDate?: string | null;
  memo?: string;
  itemName: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  lines: QbInvoiceLine[];
};

export function invoiceAddXml(input: QbInvoiceAddInput) {
  const address = addressXml(input, "BillAddress");
  const ship = addressXml(input, "ShipAddress");
  const due = input.dueDate
    ? `        <DueDate>${xmlEscape(qbDate(input.dueDate))}</DueDate>\r\n`
    : "";
  const memo = input.memo?.trim()
    ? `        <Memo>${xmlEscape(input.memo.trim().slice(0, 4095))}</Memo>\r\n`
    : "";
  const lines = (input.lines.length ? input.lines : [{ description: input.memo || "Contract work", quantity: 1, unit: "ls", unitCost: 0 }])
    .map((line) => invoiceLineXml(line, input.itemName))
    .join("");
  return wrapQbxml(
    `    <InvoiceAddRq requestID="${xmlEscape(input.requestId)}">\r\n` +
      `      <InvoiceAdd>\r\n` +
      `        <CustomerRef>\r\n` +
      `          <FullName>${xmlEscape(input.customerJobFullName)}</FullName>\r\n` +
      `        </CustomerRef>\r\n` +
      `        <TxnDate>${xmlEscape(qbDate(input.txnDate))}</TxnDate>\r\n` +
      `        <RefNumber>${xmlEscape(input.refNumber.slice(0, QB_REF_MAX))}</RefNumber>\r\n` +
      address +
      ship +
      `        <IsToBePrinted>false</IsToBePrinted>\r\n` +
      `        <IsToBeEmailed>false</IsToBeEmailed>\r\n` +
      due +
      memo +
      lines +
      `      </InvoiceAdd>\r\n` +
      `    </InvoiceAddRq>\r\n`,
  );
}

function invoiceLineXml(line: QbInvoiceLine, itemName: string) {
  const desc = [line.description, line.unit && line.unit !== "ea" && line.unit !== "ls" ? `(${line.unit})` : ""]
    .filter(Boolean)
    .join(" ")
    .trim()
    .slice(0, 4095) || itemName;
  return (
    `        <InvoiceLineAdd>\r\n` +
    `          <ItemRef>\r\n` +
    `            <FullName>${xmlEscape(qbName(itemName))}</FullName>\r\n` +
    `          </ItemRef>\r\n` +
    `          <Desc>${xmlEscape(desc)}</Desc>\r\n` +
    `          <Quantity>${xmlEscape(qbQty(line.quantity))}</Quantity>\r\n` +
    `          <Rate>${xmlEscape(qbMoney(line.unitCost))}</Rate>\r\n` +
    `        </InvoiceLineAdd>\r\n`
  );
}

function addressXml(
  input: { street?: string; city?: string; state?: string; postalCode?: string },
  tag: "BillAddress" | "ShipAddress" = "BillAddress",
) {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const zip = input.postalCode?.trim() ?? "";
  if (!street && !city) return "";
  return (
    `        <${tag}>\r\n` +
    (street ? `          <Addr1>${xmlEscape(street.slice(0, 41))}</Addr1>\r\n` : "") +
    (city ? `          <City>${xmlEscape(city.slice(0, 31))}</City>\r\n` : "") +
    (state ? `          <State>${xmlEscape(state.slice(0, 21))}</State>\r\n` : "") +
    (zip ? `          <PostalCode>${xmlEscape(zip.slice(0, 13))}</PostalCode>\r\n` : "") +
    `        </${tag}>\r\n`
  );
}

export type QbResponseKind = "found" | "missing" | "ok" | "exists" | "error";

export function readQbResponse(xml: string): {
  kind: QbResponseKind;
  statusCode: string;
  statusMessage: string;
  txnId: string;
  listId: string;
} {
  const statusCode = xmlAttr(xml, "statusCode") || firstStatusCode(xml);
  const statusMessage = decodeEntities(xmlAttr(xml, "statusMessage") || firstStatusMessage(xml));
  const txnId = innerTag(xml, "TxnID");
  const listId = innerTag(xml, "ListID");
  const code = Number(statusCode);
  if (code === 0 && (txnId || listId || /Ret>/i.test(xml))) {
    return { kind: txnId || listId ? "ok" : "found", statusCode, statusMessage, txnId, listId };
  }
  if (code === 0) {
    const hasRet = /<(Customer|ItemService|Invoice)Ret[\s>]/i.test(xml);
    return { kind: hasRet ? "found" : "missing", statusCode, statusMessage, txnId, listId };
  }
  // Duplicate name / already exists — treat as success so we can move on.
  if (code === 3100 || code === 3140 || /already in use|already exists/i.test(statusMessage)) {
    return { kind: "exists", statusCode, statusMessage, txnId, listId };
  }
  return { kind: "error", statusCode, statusMessage, txnId, listId };
}

function firstStatusCode(xml: string) {
  const match = /statusCode="(\d+)"/i.exec(xml);
  return match?.[1] ?? "";
}

function firstStatusMessage(xml: string) {
  const match = /statusMessage="([^"]*)"/i.exec(xml);
  return match?.[1] ?? "";
}

function innerTag(xml: string, tag: string) {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(xml);
  return match?.[1]?.trim() ?? "";
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
