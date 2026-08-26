import { xmlAttr, xmlEscape } from "@/lib/qbwc/xml";

/** QuickBooks Desktop customer/job Name max length. */
export const QB_NAME_MAX = 41;
/** RefNumber on InvoiceAdd is short in older company files. */
export const QB_REF_MAX = 11;

export function qbAscii(value: string, max: number) {
  return value
    .replace(/[:\t\n\r]/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function qbName(value: string, max = QB_NAME_MAX) {
  return qbAscii(value, max) || "Customer";
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
    `  <QBXMLMsgsRq onError="continueOnError">\r\n` +
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
  // OSR order: Name, IsActive, ParentRef, CompanyName, BillAddress, Phone.
  const phone = qbAscii(input.phone ?? "", 21);
  return wrapQbxml(
    `    <CustomerAddRq requestID="${xmlEscape(input.requestId)}">\r\n` +
      `      <CustomerAdd>\r\n` +
      `        <Name>${xmlEscape(qbName(input.name))}</Name>\r\n` +
      `        <IsActive>true</IsActive>\r\n` +
      (input.parentFullName
        ? `        <ParentRef>\r\n          <FullName>${xmlEscape(qbName(input.parentFullName))}</FullName>\r\n        </ParentRef>\r\n`
        : "") +
      (input.companyName?.trim()
        ? `        <CompanyName>${xmlEscape(qbName(input.companyName))}</CompanyName>\r\n`
        : "") +
      addressXml(input, "BillAddress") +
      (phone ? `        <Phone>${xmlEscape(phone)}</Phone>\r\n` : "") +
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

export function vendorQueryXml(fullName: string, requestId: string) {
  return wrapQbxml(
    `    <VendorQueryRq requestID="${xmlEscape(requestId)}">\r\n` +
      `      <FullName>${xmlEscape(qbName(fullName))}</FullName>\r\n` +
      `    </VendorQueryRq>\r\n`,
  );
}

export function vendorAddXml(name: string, requestId: string) {
  return wrapQbxml(
    `    <VendorAddRq requestID="${xmlEscape(requestId)}">\r\n` +
      `      <VendorAdd>\r\n` +
      `        <Name>${xmlEscape(qbName(name))}</Name>\r\n` +
      `        <IsActive>true</IsActive>\r\n` +
      `      </VendorAdd>\r\n` +
      `    </VendorAddRq>\r\n`,
  );
}

export function expenseLineXml(input: {
  accountName: string;
  amount: number;
  memo?: string;
  customerJobFullName?: string;
}) {
  const memo = qbAscii(input.memo ?? "", 4095);
  const job = input.customerJobFullName?.trim() ?? "";
  return (
    `        <ExpenseLineAdd>\r\n` +
    `          <AccountRef>\r\n` +
    `            <FullName>${xmlEscape(qbName(input.accountName, 31))}</FullName>\r\n` +
    `          </AccountRef>\r\n` +
    `          <Amount>${xmlEscape(qbMoney(input.amount))}</Amount>\r\n` +
    (memo ? `          <Memo>${xmlEscape(memo)}</Memo>\r\n` : "") +
    (job
      ? `          <CustomerRef>\r\n            <FullName>${xmlEscape(job)}</FullName>\r\n          </CustomerRef>\r\n` +
        `          <BillableStatus>NotBillable</BillableStatus>\r\n`
      : "") +
    `        </ExpenseLineAdd>\r\n`
  );
}

export function checkAddXml(input: {
  requestId: string;
  bankAccount: string;
  vendor: string;
  refNumber?: string;
  txnDate: string;
  memo?: string;
  accountName: string;
  amount: number;
  customerJobFullName?: string;
}) {
  const memo = qbAscii(input.memo ?? "", 4095);
  const ref = qbAscii(input.refNumber ?? "", QB_REF_MAX);
  return wrapQbxml(
    `    <CheckAddRq requestID="${xmlEscape(input.requestId)}">\r\n` +
      `      <CheckAdd>\r\n` +
      `        <AccountRef>\r\n` +
      `          <FullName>${xmlEscape(qbName(input.bankAccount, 31))}</FullName>\r\n` +
      `        </AccountRef>\r\n` +
      `        <PayeeEntityRef>\r\n` +
      `          <FullName>${xmlEscape(qbName(input.vendor))}</FullName>\r\n` +
      `        </PayeeEntityRef>\r\n` +
      (ref ? `        <RefNumber>${xmlEscape(ref)}</RefNumber>\r\n` : "") +
      `        <TxnDate>${xmlEscape(qbDate(input.txnDate))}</TxnDate>\r\n` +
      (memo ? `        <Memo>${xmlEscape(memo)}</Memo>\r\n` : "") +
      `        <IsToBePrinted>false</IsToBePrinted>\r\n` +
      expenseLineXml(input) +
      `      </CheckAdd>\r\n` +
      `    </CheckAddRq>\r\n`,
  );
}

export function creditCardChargeAddXml(input: {
  requestId: string;
  ccAccount: string;
  vendor: string;
  refNumber?: string;
  txnDate: string;
  memo?: string;
  accountName: string;
  amount: number;
  customerJobFullName?: string;
}) {
  const memo = qbAscii(input.memo ?? "", 4095);
  const ref = qbAscii(input.refNumber ?? "", QB_REF_MAX);
  return wrapQbxml(
    `    <CreditCardChargeAddRq requestID="${xmlEscape(input.requestId)}">\r\n` +
      `      <CreditCardChargeAdd>\r\n` +
      `        <AccountRef>\r\n` +
      `          <FullName>${xmlEscape(qbName(input.ccAccount, 31))}</FullName>\r\n` +
      `        </AccountRef>\r\n` +
      `        <PayeeEntityRef>\r\n` +
      `          <FullName>${xmlEscape(qbName(input.vendor))}</FullName>\r\n` +
      `        </PayeeEntityRef>\r\n` +
      `        <TxnDate>${xmlEscape(qbDate(input.txnDate))}</TxnDate>\r\n` +
      (ref ? `        <RefNumber>${xmlEscape(ref)}</RefNumber>\r\n` : "") +
      (memo ? `        <Memo>${xmlEscape(memo)}</Memo>\r\n` : "") +
      expenseLineXml(input) +
      `      </CreditCardChargeAdd>\r\n` +
      `    </CreditCardChargeAddRq>\r\n`,
  );
}

export function receivePaymentAddXml(input: {
  requestId: string;
  customerName: string;
  txnDate: string;
  refNumber?: string;
  amount: number;
  memo?: string;
  depositAccount?: string;
  invoiceTxnId?: string;
}) {
  const memo = qbAscii(input.memo ?? "", 4095);
  const ref = qbAscii(input.refNumber ?? "", QB_REF_MAX);
  const deposit = qbAscii(input.depositAccount ?? "", 31);
  const txnId = input.invoiceTxnId?.trim() ?? "";
  return wrapQbxml(
    `    <ReceivePaymentAddRq requestID="${xmlEscape(input.requestId)}">\r\n` +
      `      <ReceivePaymentAdd>\r\n` +
      `        <CustomerRef>\r\n` +
      `          <FullName>${xmlEscape(input.customerName)}</FullName>\r\n` +
      `        </CustomerRef>\r\n` +
      `        <TxnDate>${xmlEscape(qbDate(input.txnDate))}</TxnDate>\r\n` +
      (ref ? `        <RefNumber>${xmlEscape(ref)}</RefNumber>\r\n` : "") +
      `        <TotalAmount>${xmlEscape(qbMoney(input.amount))}</TotalAmount>\r\n` +
      (memo ? `        <Memo>${xmlEscape(memo)}</Memo>\r\n` : "") +
      (deposit
        ? `        <DepositToAccountRef>\r\n          <FullName>${xmlEscape(qbName(deposit, 31))}</FullName>\r\n        </DepositToAccountRef>\r\n`
        : "") +
      `        <IsAutoApply>${txnId ? "false" : "true"}</IsAutoApply>\r\n` +
      (txnId
        ? `        <AppliedToTxnAdd>\r\n` +
          `          <TxnID>${xmlEscape(txnId)}</TxnID>\r\n` +
          `          <PaymentAmount>${xmlEscape(qbMoney(input.amount))}</PaymentAmount>\r\n` +
          `        </AppliedToTxnAdd>\r\n`
        : "") +
      `      </ReceivePaymentAdd>\r\n` +
      `    </ReceivePaymentAddRq>\r\n`,
  );
}

export function invoiceAddXml(input: QbInvoiceAddInput) {
  // OSR order: CustomerRef, TxnDate, RefNumber, BillAddress, ShipAddress,
  // DueDate, Memo, IsToBePrinted, IsToBeEmailed, InvoiceLineAdd.
  const memo = qbAscii(input.memo ?? "", 4095);
  const lines = (input.lines.length
    ? input.lines
    : [{ description: input.memo || "Contract work", quantity: 1, unit: "ls", unitCost: 0 }])
    .map((line) => invoiceLineXml(line, input.itemName))
    .join("");
  return wrapQbxml(
    `    <InvoiceAddRq requestID="${xmlEscape(input.requestId)}">\r\n` +
      `      <InvoiceAdd>\r\n` +
      `        <CustomerRef>\r\n` +
      `          <FullName>${xmlEscape(input.customerJobFullName)}</FullName>\r\n` +
      `        </CustomerRef>\r\n` +
      `        <TxnDate>${xmlEscape(qbDate(input.txnDate))}</TxnDate>\r\n` +
      `        <RefNumber>${xmlEscape(qbAscii(input.refNumber, QB_REF_MAX))}</RefNumber>\r\n` +
      addressXml(input, "BillAddress") +
      addressXml(input, "ShipAddress") +
      (input.dueDate ? `        <DueDate>${xmlEscape(qbDate(input.dueDate))}</DueDate>\r\n` : "") +
      (memo ? `        <Memo>${xmlEscape(memo)}</Memo>\r\n` : "") +
      `        <IsToBePrinted>false</IsToBePrinted>\r\n` +
      `        <IsToBeEmailed>false</IsToBeEmailed>\r\n` +
      lines +
      `      </InvoiceAdd>\r\n` +
      `    </InvoiceAddRq>\r\n`,
  );
}

function invoiceLineXml(line: QbInvoiceLine, itemName: string) {
  const raw = [line.description, line.unit && line.unit !== "ea" && line.unit !== "ls" ? `(${line.unit})` : ""]
    .filter(Boolean)
    .join(" ");
  const desc = qbAscii(raw, 4095) || qbName(itemName);
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
  const street = qbAscii(input.street ?? "", 41);
  const city = qbAscii(input.city ?? "", 31);
  const state = qbAscii(input.state ?? "", 21);
  const zip = qbAscii(input.postalCode ?? "", 13);
  if (!street && !city) return "";
  return (
    `        <${tag}>\r\n` +
    (street ? `          <Addr1>${xmlEscape(street)}</Addr1>\r\n` : "") +
    (city ? `          <City>${xmlEscape(city)}</City>\r\n` : "") +
    (state ? `          <State>${xmlEscape(state)}</State>\r\n` : "") +
    (zip ? `          <PostalCode>${xmlEscape(zip)}</PostalCode>\r\n` : "") +
    `        </${tag}>\r\n`
  );
}

export type QbResponseKind = "found" | "missing" | "ok" | "exists" | "error";

export type QbParsedResponse = {
  kind: QbResponseKind;
  statusCode: string;
  statusMessage: string;
  txnId: string;
  listId: string;
};

/** CustomerQuery/ItemQuery status 500: the FullName is not in the company file. */
export function isQbNotFoundMessage(message: string) {
  return /could not be found|not found in QuickBooks|no matching object/i.test(message);
}

export function readQbResponse(xml: string, fallbackMessage = ""): QbParsedResponse {
  const trimmed = xml.trim();
  if (!trimmed && isQbNotFoundMessage(fallbackMessage)) {
    return {
      kind: "missing",
      statusCode: "500",
      statusMessage: fallbackMessage,
      txnId: "",
      listId: "",
    };
  }
  const statusCode = xmlAttr(trimmed, "statusCode") || firstStatusCode(trimmed);
  const statusMessage = decodeEntities(
    xmlAttr(trimmed, "statusMessage") || firstStatusMessage(trimmed) || fallbackMessage,
  );
  const txnId = innerTag(trimmed, "TxnID");
  const listId = innerTag(trimmed, "ListID");
  const code = Number(statusCode);
  if (code === 0 && (txnId || listId || /Ret>/i.test(trimmed))) {
    return { kind: txnId || listId ? "ok" : "found", statusCode, statusMessage, txnId, listId };
  }
  if (code === 0) {
    const hasRet =
      /<(Customer|Vendor|ItemService|Invoice|Check|CreditCardCharge|ReceivePayment)Ret[\s>]/i.test(
        trimmed,
      );
    return { kind: hasRet ? "found" : "missing", statusCode, statusMessage, txnId, listId };
  }
  // Duplicate name / already exists — treat as success so we can move on.
  if (code === 3100 || code === 3140 || /already in use|already exists/i.test(statusMessage)) {
    return { kind: "exists", statusCode, statusMessage, txnId, listId };
  }
  // Query FullName/ListID is not in this company file — caller should Add, not stop.
  if (code === 1 || code === 500 || code === 3120 || isQbNotFoundMessage(statusMessage)) {
    return { kind: "missing", statusCode, statusMessage, txnId, listId };
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
