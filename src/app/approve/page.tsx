import { redirect } from "next/navigation";

export default async function ApproveShortcutPage({
  searchParams,
}: PageProps<"/approve">) {
  const query = await searchParams;
  const invoice = typeof query.invoice === "string" ? query.invoice : undefined;
  if (invoice) {
    redirect(`/accounting?tab=review&invoice=${encodeURIComponent(invoice)}`);
  }
  redirect("/accounting?tab=review");
}
