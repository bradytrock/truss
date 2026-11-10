export const CASSIO_ASK_EVENT = "cassio-ask";
export const CASSIO_OPEN_EVENT = "cassio-open";
/** @deprecated Prefer CASSIO_ASK_EVENT */
export const TRUSS_ASK_EVENT = CASSIO_ASK_EVENT;

export function askCassio(prompt: string) {
  if (typeof window === "undefined") return;
  const text = prompt.trim();
  if (!text) return;
  window.dispatchEvent(new CustomEvent(CASSIO_ASK_EVENT, { detail: { prompt: text } }));
}

/** Open the Ask Cassio panel so the seat can say what to create. */
export function openCassio() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CASSIO_OPEN_EVENT));
}

/** @deprecated Prefer askCassio */
export const askTruss = askCassio;
