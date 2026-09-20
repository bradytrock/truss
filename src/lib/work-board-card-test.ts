import { boardCardDetails } from "./work-board";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const gregory = boardCardDetails({
  title: "Gregory — 9144 Shadow Ridge Drive, Highland Village, TX 75077",
  customerName: "Shawn Gregory",
  location: "9144 Shadow Ridge Drive, Highland Village, TX 75077",
  street: "9144 Shadow Ridge Drive",
});
assert(!gregory.showCustomer, "last name already in title");
assert(!gregory.showLocation, "address already in title");

const distinct = boardCardDetails({
  title: "Roof replacement",
  customerName: "Shawn Gregory",
  location: "9144 Shadow Ridge Drive, Highland Village, TX 75077",
  street: "9144 Shadow Ridge Drive",
});
assert(distinct.showCustomer, "customer is extra");
assert(distinct.showLocation, "location is extra");

const missing = boardCardDetails({
  title: undefined as unknown as string,
  customerName: undefined as unknown as string,
  location: undefined as unknown as string,
});
assert(missing.title === "", "nullish title does not throw");
assert(!missing.showCustomer, "nullish customer is hidden");
assert(!missing.showLocation, "nullish location is hidden");

console.log("work-board card tests passed");
