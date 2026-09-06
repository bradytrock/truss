export const CASSIO_ASK_EVENT = "cassio-ask";
/** @deprecated Prefer CASSIO_ASK_EVENT */
export const TRUSS_ASK_EVENT = CASSIO_ASK_EVENT;

export function askCassio(prompt: string) {
  if (typeof window === "undefined") return;
  const text = prompt.trim();
  if (!text) return;
  window.dispatchEvent(new CustomEvent(CASSIO_ASK_EVENT, { detail: { prompt: text } }));
}

/** @deprecated Prefer askCassio */
export const askTruss = askCassio;
