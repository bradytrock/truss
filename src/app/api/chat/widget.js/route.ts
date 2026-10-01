export const runtime = "nodejs";

const SCRIPT = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var company = (script.getAttribute("data-company") || "").trim();
  if (!company) return;
  var origin = new URL(script.src).origin;
  var frame = document.createElement("iframe");
  var closed = "60px";
  frame.title = "Chat";
  frame.src = origin + "/chat/" + encodeURIComponent(company) + "?embed=1";
  frame.setAttribute("allowtransparency", "true");
  frame.setAttribute("scrolling", "no");
  frame.style.cssText = "position:fixed;right:max(16px, env(safe-area-inset-right));bottom:max(16px, env(safe-area-inset-bottom));width:" + closed + ";height:" + closed + ";border:0;border-radius:999px;overflow:hidden;z-index:2147483000;background:transparent;box-shadow:0 10px 24px rgba(28,12,8,0.35);";
  function place(open, width, height) {
    if (open) {
      frame.style.width = width || "min(380px, calc(100vw - 32px))";
      frame.style.height = height || "min(640px, calc(100vh - 32px))";
      frame.style.borderRadius = "20px";
      frame.style.boxShadow = "0 22px 50px rgba(28,12,8,0.28)";
    } else {
      frame.style.width = width || closed;
      frame.style.height = height || closed;
      frame.style.borderRadius = "999px";
      frame.style.boxShadow = "0 10px 24px rgba(28,12,8,0.35)";
    }
  }
  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    var data = event.data;
    if (!data || data.type !== "truss-chat-size") return;
    place(!!data.open, data.width, data.height);
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
