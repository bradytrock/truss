import assert from "node:assert/strict";
import {
  clearWelcomePending,
  hasSeenWelcome,
  isWelcomePendingMetadata,
  markWelcomeSeen,
  peekWelcomePending,
  queueFirstWelcome,
  shouldOpenWelcome,
  signupUserMetadata,
  welcomeSeenKey,
} from "./welcome.ts";

assert.equal(isWelcomePendingMetadata(undefined), false);
assert.equal(isWelcomePendingMetadata({}), false);
assert.equal(isWelcomePendingMetadata({ welcome_pending: false }), false);
assert.equal(isWelcomePendingMetadata({ welcome_pending: true }), true);
assert.equal(isWelcomePendingMetadata({ welcome_pending: "true" }), true);

assert.equal(
  shouldOpenWelcome({
    alreadySeen: false,
    sessionPending: false,
    metadataPending: false,
  }),
  false,
);
assert.equal(
  shouldOpenWelcome({
    alreadySeen: false,
    sessionPending: true,
    metadataPending: false,
  }),
  true,
);
assert.equal(
  shouldOpenWelcome({
    alreadySeen: false,
    sessionPending: false,
    metadataPending: true,
  }),
  true,
);
assert.equal(
  shouldOpenWelcome({
    alreadySeen: true,
    sessionPending: true,
    metadataPending: true,
  }),
  false,
);
assert.equal(
  shouldOpenWelcome({
    alreadySeen: true,
    sessionPending: false,
    metadataPending: false,
    force: true,
  }),
  true,
);

const meta = signupUserMetadata({
  fullName: "Alex Rivera",
  company: "T Rock Roofing",
  title: "Superintendent",
  inviteToken: "tok_1",
});
assert.equal(meta.welcome_pending, true);
assert.equal(meta.full_name, "Alex Rivera");
assert.equal(meta.company, "T Rock Roofing");
assert.equal(meta.invite_token, "tok_1");

const session = new Map<string, string>();
const sessionStore = {
  getItem: (key: string) => session.get(key) ?? null,
  setItem: (key: string, value: string) => {
    session.set(key, value);
  },
  removeItem: (key: string) => {
    session.delete(key);
  },
};
const local = new Map<string, string>();
const localStore = {
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => {
    local.set(key, value);
  },
};

queueFirstWelcome(sessionStore);
assert.equal(peekWelcomePending(sessionStore), true);
assert.equal(hasSeenWelcome("user_1", localStore), false);

markWelcomeSeen("user_1", localStore, sessionStore);
assert.equal(peekWelcomePending(sessionStore), false);
assert.equal(hasSeenWelcome("user_1", localStore), true);
assert.equal(local.get(welcomeSeenKey("user_1")), "1");

clearWelcomePending(sessionStore);
assert.equal(peekWelcomePending(sessionStore), false);
