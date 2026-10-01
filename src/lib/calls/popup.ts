const DIALER_POPUP_NAME = "truss-dialer";
const DIALER_POPUP_FEATURES =
  "popup=yes,width=400,height=720,left=72,top=72,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes";

/** Open (or focus) the compact dialer in a small browser window. */
export function openDialerPopup(path = "/calls/popup") {
  if (typeof window === "undefined") return null;
  const url = new URL(path, window.location.origin).toString();
  const popup = window.open(url, DIALER_POPUP_NAME, DIALER_POPUP_FEATURES);
  if (!popup) return null;
  try {
    popup.focus();
  } catch {
    // Some browsers block focus after pop-up open.
  }
  return popup;
}

export function isDialerPopupPath(pathname: string) {
  return pathname === "/calls/popup" || pathname.startsWith("/calls/popup/");
}
