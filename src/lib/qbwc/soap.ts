import { PRODUCT_NAME } from "@/lib/product";
import { soapHas, soapTag, xmlEscape } from "@/lib/qbwc/xml";

export const QBWC_NS = "http://developer.intuit.com/";

export type QbwcSoapCall =
  | { op: "serverVersion" }
  | { op: "clientVersion"; strVersion: string }
  | { op: "authenticate"; strUserName: string; strPassword: string }
  | {
      op: "sendRequestXML";
      ticket: string;
      strHCPResponse: string;
      strCompanyFileName: string;
      qbXMLCountry: string;
      qbXMLMajorVers: string;
      qbXMLMinorVers: string;
    }
  | { op: "receiveResponseXML"; ticket: string; response: string; hresult: string; message: string }
  | { op: "connectionError"; ticket: string; hresult: string; message: string }
  | { op: "getLastError"; ticket: string }
  | { op: "closeConnection"; ticket: string }
  | { op: "unknown" };

export function parseQbwcSoap(xml: string): QbwcSoapCall {
  if (soapHas(xml, "serverVersion")) return { op: "serverVersion" };
  if (soapHas(xml, "clientVersion")) {
    return { op: "clientVersion", strVersion: soapTag(xml, "strVersion") };
  }
  if (soapHas(xml, "authenticate")) {
    return {
      op: "authenticate",
      strUserName: soapTag(xml, "strUserName"),
      strPassword: soapTag(xml, "strPassword"),
    };
  }
  if (soapHas(xml, "sendRequestXML")) {
    return {
      op: "sendRequestXML",
      ticket: soapTag(xml, "ticket"),
      strHCPResponse: soapTag(xml, "strHCPResponse"),
      strCompanyFileName: soapTag(xml, "strCompanyFileName"),
      qbXMLCountry: soapTag(xml, "qbXMLCountry"),
      qbXMLMajorVers: soapTag(xml, "qbXMLMajorVers"),
      qbXMLMinorVers: soapTag(xml, "qbXMLMinorVers"),
    };
  }
  if (soapHas(xml, "receiveResponseXML")) {
    return {
      op: "receiveResponseXML",
      ticket: soapTag(xml, "ticket"),
      response: soapTag(xml, "response"),
      hresult: soapTag(xml, "hresult"),
      message: soapTag(xml, "message"),
    };
  }
  if (soapHas(xml, "connectionError")) {
    return {
      op: "connectionError",
      ticket: soapTag(xml, "ticket"),
      hresult: soapTag(xml, "hresult"),
      message: soapTag(xml, "message"),
    };
  }
  if (soapHas(xml, "getLastError")) {
    return { op: "getLastError", ticket: soapTag(xml, "ticket") };
  }
  if (soapHas(xml, "closeConnection")) {
    return { op: "closeConnection", ticket: soapTag(xml, "ticket") };
  }
  return { op: "unknown" };
}

export function soapStringResponse(op: string, value: string) {
  return soapEnvelope(
    `<${op}Response xmlns="${QBWC_NS}">` +
      `<${op}Result>${xmlEscape(value)}</${op}Result>` +
      `</${op}Response>`,
  );
}

export function soapIntResponse(op: string, value: number) {
  return soapEnvelope(
    `<${op}Response xmlns="${QBWC_NS}">` +
      `<${op}Result>${value}</${op}Result>` +
      `</${op}Response>`,
  );
}

export function soapAuthenticateResult(ticket: string, status: string) {
  return soapEnvelope(
    `<authenticateResponse xmlns="${QBWC_NS}">` +
      `<authenticateResult>` +
      `<string>${xmlEscape(ticket)}</string>` +
      `<string>${xmlEscape(status)}</string>` +
      `</authenticateResult>` +
      `</authenticateResponse>`,
  );
}

function soapEnvelope(body: string) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<soap:Body>${body}</soap:Body>` +
    `</soap:Envelope>`
  );
}

export function qbwcFile(input: {
  appUrl: string;
  userName: string;
  ownerId: string;
  fileId: string;
  supportUrl?: string;
  minutes?: number;
}) {
  const owner = braceGuid(input.ownerId);
  const file = braceGuid(input.fileId);
  const support = input.supportUrl || input.appUrl;
  const minutes = input.minutes ?? 15;
  return (
    `<?xml version="1.0"?>\n` +
    `<QBWCXML>\n` +
    `  <AppName>${xmlEscape(PRODUCT_NAME)}</AppName>\n` +
    `  <AppID></AppID>\n` +
    `  <AppURL>${xmlEscape(input.appUrl)}</AppURL>\n` +
    `  <AppDescription>Pushes approved invoices and job expenses from ${xmlEscape(PRODUCT_NAME)} into QuickBooks Desktop on the right Customer:Job.</AppDescription>\n` +
    `  <AppSupport>${xmlEscape(support)}</AppSupport>\n` +
    `  <UserName>${xmlEscape(input.userName)}</UserName>\n` +
    `  <OwnerID>${owner}</OwnerID>\n` +
    `  <FileID>${file}</FileID>\n` +
    `  <QBType>QBFS</QBType>\n` +
    `  <Notify>false</Notify>\n` +
    `  <Scheduler>\n` +
    `    <RunEveryNMinutes>${minutes}</RunEveryNMinutes>\n` +
    `  </Scheduler>\n` +
    `</QBWCXML>\n`
  );
}

export function braceGuid(value: string) {
  const raw = value.replace(/[{}]/g, "");
  return `{${raw}}`;
}

export function soapResponseHeaders() {
  return {
    "Content-Type": "text/xml; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
