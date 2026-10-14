export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const href = pathToFileURL(path.join(process.cwd(), "scripts", "railway-rest.mjs")).href;
  const { startRailwayRest } = await import(href);
  await startRailwayRest(process.cwd());
}
