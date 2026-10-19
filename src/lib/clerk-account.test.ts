import assert from "node:assert/strict";
import {
  clerkIdentifierTaken,
  missingClerkProvisionMessage,
  parseClerkSignup,
  readClerkError,
  splitPersonName,
} from "./clerk-account.ts";
import { runClerkSignup, type ClerkSignInClient } from "./clerk-signup-client.ts";

const account = {
  email: "ada@example.com",
  password: "correct horse",
  fullName: "Ada Lovelace",
  company: "Analytical Engines",
  title: "Company admin",
};

assert.deepEqual(splitPersonName("  Ada   Lovelace  "), { firstName: "Ada", lastName: "Lovelace" });
assert.deepEqual(splitPersonName("Ada"), { firstName: "Ada", lastName: "" });

assert.equal(parseClerkSignup({ ...account, email: "nope" }).ok, false);
assert.equal(parseClerkSignup({ ...account, password: "short" }).ok, false);
assert.equal(parseClerkSignup({ ...account, company: "", inviteToken: "" }).ok, false);
const parsed = parseClerkSignup({ ...account, email: " Ada@Example.com ", inviteToken: " tok " });
assert.equal(parsed.ok, true);
if (parsed.ok) {
  assert.equal(parsed.value.email, "ada@example.com");
  assert.equal(parsed.value.inviteToken, "tok");
}

assert.equal(clerkIdentifierTaken("form_identifier_exists", "taken"), true);
assert.equal(clerkIdentifierTaken("", "That email address is taken."), true);
assert.equal(clerkIdentifierTaken("form_password_pwned", "password was found"), false);
assert.equal(readClerkError({ errors: [{ code: "form_password_pwned", longMessage: "Choose another." }] }).message, "Choose another.");
assert.match(missingClerkProvisionMessage("function provision_clerk_user does not exist"), /20261019120000_clerk_accounts/);

function fakeSignIn(): ClerkSignInClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    status: "complete",
    async ticket() {
      calls.push("ticket");
      return { error: null };
    },
    async password() {
      calls.push("password");
      return { error: null };
    },
    async finalize({ navigate }) {
      calls.push("finalize");
      await navigate({ decorateUrl: (path) => path });
    },
  };
}

const landed = { url: "" };
const previousWindow = globalThis.window;
globalThis.window = {
  location: {
    assign(url: string) {
      landed.url = url;
    },
  },
} as unknown as Window & typeof globalThis;

void (async () => {
try {
  const created = fakeSignIn();
  const createdResult = await runClerkSignup({
    account,
    destination: "/?welcome=1",
    signIn: created,
    post: async (path) => {
      assert.equal(path, "/api/auth/signup");
      return { ok: true, status: 200, body: { status: "created", ticket: "sit_1" } };
    },
  });
  assert.equal(createdResult.ok, true);
  assert.deepEqual(created.calls, ["ticket", "finalize"]);
  assert.equal(landed.url, "/?welcome=1");

  const existing = fakeSignIn();
  const posts: string[] = [];
  const existingResult = await runClerkSignup({
    account: { ...account, inviteToken: "invite-1" },
    destination: "/welcome",
    inviteToken: "invite-1",
    signIn: existing,
    post: async (path) => {
      posts.push(path);
      if (path === "/api/auth/signup") return { ok: true, status: 200, body: { status: "exists" } };
      return { ok: true, status: 200, body: { ok: true } };
    },
  });
  assert.equal(existingResult.ok, true);
  assert.deepEqual(posts, ["/api/auth/signup", "/api/auth/claim-invite"]);
  assert.deepEqual(existing.calls, ["password", "finalize"]);

  const duplicate = await runClerkSignup({
    account,
    destination: "/",
    signIn: fakeSignIn(),
    post: async () => ({ ok: true, status: 200, body: { status: "exists" } }),
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.match(duplicate.message, /already has a login/);
} finally {
  globalThis.window = previousWindow;
}

console.log("clerk account tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
