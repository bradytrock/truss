import { NextResponse } from "next/server";
import { PRODUCT_NAME } from "@/lib/product";
import {
  parseQbwcSoap,
  soapAuthenticateResult,
  soapIntResponse,
  soapResponseHeaders,
  soapStringResponse,
} from "@/lib/qbwc/soap";
import {
  qbwcApply,
  qbwcAuthenticate,
  qbwcClose,
  qbwcLastError,
  qbwcNextWork,
} from "@/lib/qbwc/service";
import { advanceFromResponse, requestForStep } from "@/lib/qbwc/steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "1.0";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: PRODUCT_NAME,
    soap: "/api/qbwc",
    hint: "Point QuickBooks Web Connector at this URL. Accounting → Web Connector downloads the .qwc file.",
  });
}

export async function POST(request: Request) {
  const xml = await request.text();
  const call = parseQbwcSoap(xml);
  try {
    const body = await dispatch(call);
    return new NextResponse(body, { status: 200, headers: soapResponseHeaders() });
  } catch (error) {
    console.error("[qbwc] soap", error);
    return new NextResponse(
      soapStringResponse("getLastError", "Truss could not talk to QuickBooks just then. Try the connector again."),
      { status: 200, headers: soapResponseHeaders() },
    );
  }
}

async function dispatch(call: ReturnType<typeof parseQbwcSoap>) {
  switch (call.op) {
    case "serverVersion":
      return soapStringResponse("serverVersion", VERSION);
    case "clientVersion":
      return soapStringResponse("clientVersion", "");
    case "authenticate": {
      const result = await qbwcAuthenticate(call.strUserName, call.strPassword);
      if (!result.ok) {
        return soapAuthenticateResult("", result.reason === "sql" ? "none" : "nvu");
      }
      return soapAuthenticateResult(result.ticket, "");
    }
    case "sendRequestXML": {
      const next = await qbwcNextWork(call.ticket);
      if (!next.ok) {
        return soapStringResponse("sendRequestXML", "");
      }
      if (next.done) {
        return soapStringResponse("sendRequestXML", "");
      }
      return soapStringResponse("sendRequestXML", requestForStep(next.step, next.work));
    }
    case "receiveResponseXML": {
      if (call.hresult && call.hresult !== "0x0" && call.hresult !== "") {
        await qbwcApply(call.ticket, "fail", { error: call.message || call.hresult });
        return soapIntResponse("receiveResponseXML", -1);
      }
      const current = await qbwcNextWork(call.ticket);
      if (!current.ok || current.done) {
        return soapIntResponse("receiveResponseXML", 100);
      }
      const advance = advanceFromResponse(current.step, call.response);
      if (advance.action === "fail") {
        await qbwcApply(call.ticket, "fail", { error: advance.error });
        return soapIntResponse("receiveResponseXML", -1);
      }
      if (advance.action === "complete") {
        await qbwcApply(call.ticket, "complete", { txnId: advance.txnId });
        const more = await qbwcNextWork(call.ticket);
        return soapIntResponse("receiveResponseXML", !more.ok || more.done ? 100 : 50);
      }
      await qbwcApply(call.ticket, "next", { nextStep: advance.step });
      return soapIntResponse("receiveResponseXML", 25);
    }
    case "connectionError":
      await qbwcApply(call.ticket, "fail", { error: call.message || call.hresult });
      return soapStringResponse("connectionError", "done");
    case "getLastError":
      return soapStringResponse("getLastError", await qbwcLastError(call.ticket));
    case "closeConnection":
      await qbwcClose(call.ticket);
      return soapStringResponse("closeConnection", "OK");
    default:
      return soapStringResponse("getLastError", "This Web Connector call is not supported.");
  }
}
