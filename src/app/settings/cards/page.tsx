import { redirect } from "next/navigation";

/** Card activity moved to Reports → Card activity. */
export default function CardAnalyticsRedirectPage() {
  redirect("/reports?tab=cards");
}
