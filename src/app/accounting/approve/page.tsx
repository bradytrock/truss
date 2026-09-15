import { redirect } from "next/navigation";

export default function AccountingApprovePage() {
  redirect("/accounting?tab=review");
}
