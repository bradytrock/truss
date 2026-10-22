import assert from "node:assert/strict";
import {
  cardSlugAliasesAfterSave,
  cardSlugTakenMessage,
  draftFromMember,
  fillSignature,
  mismatchedSignaturePhone,
  parseCardSlugAliases,
  photoTooLargeMessage,
  possessive,
  profileChanges,
  profileFieldErrors,
  replaceMismatchedPhone,
  roleBookHelp,
  suggestFreeCardSlug,
  takenCardSlugs,
  latestWebsiteChatAt,
} from "./profile-editor.ts";
import type { StaffMember } from "./types.ts";

function member(patch: Partial<StaffMember> = {}): StaffMember {
  return {
    id: "brady",
    name: "Brady Jones",
    title: "Project Manager",
    role: "company_admin",
    teamId: null,
    initials: "BJ",
    email: "bjones@trockcontracting.com",
    phone: "(469) 794-7701",
    cardSlug: "brady",
    emailSignature: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
    ...patch,
  };
}

const brady = draftFromMember(member());

assert.equal(profileFieldErrors({ ...brady, phone: "(469) 995-17" }).phone, "Enter a 10-digit phone number.");
assert.equal(
  profileFieldErrors({ ...brady, email: "cholland@trockcontracting" }).email,
  "Enter a full email, like name@company.com.",
);
assert.equal(profileFieldErrors(brady).phone, undefined);
assert.equal(profileFieldErrors({ ...brady, phone: "" }).phone, undefined);

assert.equal(possessive("Brady"), "Brady's");
assert.equal(possessive("Sam Rogers"), "Sam Rogers's");

assert.equal(
  roleBookHelp("company_admin"),
  "Company admin: sees every job, contact, and report. Team controls whose book they see.",
);

const sam = member({ id: "sam", cardSlug: "sam.rogers", cardSlugAliases: ["sam"] });
const taken = takenCardSlugs([sam], "brady");
assert.equal(taken.has("sam.rogers"), true);
assert.equal(taken.has("sam"), true);
assert.equal(suggestFreeCardSlug("sam.rogers", taken), "sam.rogers2");
assert.equal(
  cardSlugTakenMessage("sam.rogers", "sam.rogers2"),
  "Someone already uses /sam.rogers. Try /sam.rogers2 or a nickname.",
);

assert.deepEqual(
  cardSlugAliasesAfterSave({
    previousSlug: "brady",
    previousAliases: [],
    nextSlug: "brady.jones",
    keepRedirect: true,
  }),
  ["brady"],
);
assert.deepEqual(
  cardSlugAliasesAfterSave({
    previousSlug: "brady",
    previousAliases: ["old"],
    nextSlug: "brady.jones",
    keepRedirect: false,
  }),
  ["old"],
);
assert.deepEqual(parseCardSlugAliases("brady, brady.jones"), ["brady", "brady.jones"]);

const changes = profileChanges(
  { ...brady, title: "Senior Project Manager", quota: "40000" },
  { ...brady, quota: "35000" },
  { teams: [], locations: [] },
);
assert.deepEqual(
  changes.map((change) => [change.label, change.from, change.to]),
  [
    ["Title", "Project Manager", "Senior Project Manager"],
    ["Monthly quota", "$35,000", "$40,000"],
  ],
);

assert.equal(
  fillSignature("Best,\n{name}\n{phone}", {
    name: "Brady Jones",
    title: "Project Manager",
    phone: "4697947701",
    email: "bjones@trockcontracting.com",
  }),
  "Best,\nBrady Jones\n(469) 794-7701",
);

const mismatch = mismatchedSignaturePhone("Best,\n469-931-9867", "(469) 794-7701");
assert.equal(mismatch?.found, "(469) 931-9867");
assert.equal(mismatch?.file, "(469) 794-7701");
assert.equal(mismatchedSignaturePhone("Call {phone} or (469) 794-7701", "(469) 794-7701"), null);
assert.equal(replaceMismatchedPhone("Best,\n469-931-9867", "(469) 794-7701"), "Best,\n{phone}");

assert.equal(photoTooLargeMessage(6.4 * 1024 * 1024), "That file is 6.4 MB. Pick a photo under 2 MB.");

assert.equal(
  latestWebsiteChatAt(
    [
      { ownerStaffId: "brady", leadSource: "phone", createdAt: "2026-10-20T00:00:00.000Z" },
      { ownerStaffId: "brady", leadSource: "website", createdAt: "2026-10-12T15:00:00.000Z" },
      { ownerStaffId: "sam", leadSource: "website", createdAt: "2026-10-18T15:00:00.000Z" },
    ],
    "brady",
  ),
  "2026-10-12T15:00:00.000Z",
);

console.log("profile-editor.test.ts ok");
