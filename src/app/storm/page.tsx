import { redirect } from "next/navigation";

/** The hail map and SPC outlooks live on Map. */
export default function StormPage() {
  redirect("/map");
}
