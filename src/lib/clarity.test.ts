import assert from "node:assert/strict";
import { CLARITY_PROJECT_ID, clarityHeadScript, clarityRecordingEnabled } from "./clarity.ts";

assert.equal(CLARITY_PROJECT_ID, "yq1riyzvx3");

assert.equal(clarityRecordingEnabled({ nodeEnv: "production" }), true);
assert.equal(clarityRecordingEnabled({ nodeEnv: "production", vercelEnv: "production" }), true);
assert.equal(clarityRecordingEnabled({ nodeEnv: "production", vercelEnv: "preview" }), false);
assert.equal(clarityRecordingEnabled({ nodeEnv: "production", vercelEnv: "development" }), false);
assert.equal(clarityRecordingEnabled({ nodeEnv: "development" }), false);
assert.equal(clarityRecordingEnabled({ nodeEnv: "test" }), false);

const script = clarityHeadScript();
assert.match(script, /https:\/\/www\.clarity\.ms\/tag\//);
assert.match(script, new RegExp(`"script", "${CLARITY_PROJECT_ID}"`));
assert.match(script, /clarity\("set","surface","production"\)/);
assert.match(script, /input\[type='password'\]/);
assert.match(script, /clarity-mask/);

console.log("clarity.test.ts ok");
