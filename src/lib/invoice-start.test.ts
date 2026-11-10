import assert from "node:assert/strict";
import { estimatesForInvoiceStart, type InvoiceStartEstimate } from "./invoice-start.ts";

function estimate(overrides: Partial<InvoiceStartEstimate> & Pick<InvoiceStartEstimate, "id" | "status">): InvoiceStartEstimate {
  return {
    number: overrides.id.toUpperCase(),
    name: overrides.id,
    jobId: "job-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const book = [
  estimate({ id: "draft", status: "draft", name: "Kitchen draft", createdAt: "2026-03-01T00:00:00.000Z" }),
  estimate({ id: "accepted", status: "accepted", name: "Alvarez roof", number: "EST-14", createdAt: "2026-01-01T00:00:00.000Z" }),
  estimate({ id: "other-job", status: "accepted", name: "Other job", jobId: "job-2" }),
  estimate({ id: "archived", status: "accepted", name: "Old roof", archivedAt: "2026-02-01T00:00:00.000Z" }),
  estimate({ id: "declined", status: "declined", name: "Declined bath", createdAt: "2026-04-01T00:00:00.000Z" }),
  estimate({ id: "sent-new", status: "sent", name: "Sent new", createdAt: "2026-05-01T00:00:00.000Z" }),
  estimate({ id: "sent-old", status: "sent", name: "Sent old", createdAt: "2026-02-01T00:00:00.000Z" }),
];

const onJob = estimatesForInvoiceStart(book, { jobId: "job-1" });
assert.deepEqual(
  onJob.map((item) => item.id),
  ["accepted", "sent-new", "sent-old", "draft", "declined"],
);

const searched = estimatesForInvoiceStart(book, {
  query: "alvarez",
  haystack: (item) => (item.id === "accepted" ? "Dana Alvarez" : ""),
});
assert.deepEqual(
  searched.map((item) => item.id),
  ["accepted"],
);

assert.deepEqual(
  estimatesForInvoiceStart(book, { query: "est-14" }).map((item) => item.id),
  ["accepted"],
);

assert.equal(estimatesForInvoiceStart(book, { jobId: "job-9" }).length, 0);
