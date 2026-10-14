import { startRailwayRest } from "../scripts/railway-rest.mjs";

export async function bootRailway() {
  await startRailwayRest(process.cwd());
}
