export const TRUSS_ASK_EVENT = "truss-ask";

export function askTruss(prompt: string) {
  if (typeof window === "undefined") return;
  const text = prompt.trim();
  if (!text) return;
  window.dispatchEvent(new CustomEvent(TRUSS_ASK_EVENT, { detail: { prompt: text } }));
}
