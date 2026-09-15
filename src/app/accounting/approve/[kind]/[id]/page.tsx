import { redirect } from "next/navigation";
import { QbApproveDesk } from "@/components/qb-approve-desk";

export default async function ApproveItemPage({
  params,
}: PageProps<"/accounting/approve/[kind]/[id]">) {
  const { kind, id } = await params;
  if (kind === "invoice") {
    redirect(`/accounting?tab=review&invoice=${encodeURIComponent(id)}`);
  }
  if (kind === "expense") {
    redirect(`/accounting?tab=expenses&expense=${encodeURIComponent(id)}`);
  }
  return <QbApproveDesk kind={kind} id={id} />;
}
