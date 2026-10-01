import assert from "node:assert/strict";
import { distinctMessageHandle, isDuplicateMessageHandle, outboundMessageHandle } from "./message-handle.ts";

const reaction = outboundMessageHandle({ returned: "msg-1", occupied: "msg-1", kind: "reaction" });
assert.notEqual(reaction, "msg-1");
assert.match(reaction, /^msg-1:reaction:[0-9a-f]{8}$/);

assert.equal(
  outboundMessageHandle({ returned: "msg-2", occupied: "msg-1", kind: "reaction" }),
  "msg-2",
);

const reply = outboundMessageHandle({ returned: "parent", occupied: "parent", kind: "reply" });
assert.match(reply, /^parent:reply:[0-9a-f]{8}$/);

assert.equal(outboundMessageHandle({ returned: "sent-1", occupied: "", kind: "text" }), "sent-1");
assert.notEqual(distinctMessageHandle("sent-1", "text"), distinctMessageHandle("sent-1", "text"));

assert.equal(
  isDuplicateMessageHandle({
    code: "23505",
    message: 'duplicate key value violates unique constraint "messages_company_handle_idx"',
  }),
  true,
);
assert.equal(
  isDuplicateMessageHandle({ code: "23505", message: "duplicate key value violates unique constraint \"team_members_card_slug_uidx\"" }),
  false,
);
assert.equal(isDuplicateMessageHandle(null), false);
