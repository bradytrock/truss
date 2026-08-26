"use client";

import { useParams } from "next/navigation";
import { QbApproveDesk } from "@/components/qb-approve-desk";

export default function ApproveItemPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  return <QbApproveDesk kind={kind} id={id} />;
}
