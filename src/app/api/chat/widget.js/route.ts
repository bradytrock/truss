export const runtime = "nodejs";

const SCRIPT = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var company = (script.getAttribute("data-company") || "").trim();
  if (!company) return;
  var person = (script.getAttribute("data-person") || "").trim();
  var origin = new URL(script.src).origin;
  var frame = document.createElement("iframe");
  frame.title = "Chat";
  var src = origin + "/chat/" + encodeURIComponent(company) + "?embed=1";
  if (person) src += "&person=" + encodeURIComponent(person);
  frame.src = src;
  frame.setAttribute("allowtransparency", "true");
  frame.style.cssText = "position:fixed;right:16px;bottom:16px;width:88px;height:88px;border:0;z-index:2147483000;background:transparent;color-scheme:normal;";
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.type !== "truss-chat-size") return;
    if (event.data.open) {
      frame.style.width = "min(400px, calc(100vw - 24px))";
      frame.style.height = "min(680px, calc(100vh - 24px))";
    } else {
      frame.style.width = "88px";
      frame.style.height = "88px";
    }
  });
  document.body.appendChild(frame);
})();
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
