export function materialOrderOrderedByLine(input: {
  name?: string;
  phone?: string;
  email?: string;
}) {
  const name = input.name?.trim() ?? "";
  if (!name) return "";
  const parts = [name];
  const phone = input.phone?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  if (phone) parts.push(phone);
  if (email) parts.push(email);
  return `Ordered by ${parts.join(" · ")}`;
}
