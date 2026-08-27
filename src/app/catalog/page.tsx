import { permanentRedirect } from "next/navigation";

export default function CatalogRedirectPage() {
  permanentRedirect("/settings/price-book");
}
