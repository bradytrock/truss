import { redirect } from "next/navigation";

/** Kept as a filesystem fallback; next.config also redirects /pipeline → /jobs. */
export default function PipelinePage() {
  redirect("/jobs");
}
