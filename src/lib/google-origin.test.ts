import assert from "node:assert/strict";
import { googleRequestOrigin } from "./google-origin.ts";

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

assert.equal(
  googleRequestOrigin(request("http://0.0.0.0:3847/api/google/calendar/connect", { host: "localhost:3847" })),
  "http://localhost:3847",
);

assert.equal(
  googleRequestOrigin(request("http://0.0.0.0:3847/api/google/calendar/connect", { host: "0.0.0.0:3847" })),
  "http://localhost:3847",
);

assert.equal(
  googleRequestOrigin(
    request("http://0.0.0.0:3847/api/google/gmail/connect", {
      host: "0.0.0.0:3847",
      "x-forwarded-host": "trcm.app",
      "x-forwarded-proto": "https",
    }),
  ),
  "https://trcm.app",
);

assert.equal(
  googleRequestOrigin(request("http://internal:3000/api/google/calendar/connect", { host: "trcm.app" })),
  "https://trcm.app",
);
