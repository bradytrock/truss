import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { COOKIE_INTRO, COOKIE_SECTIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How Truss uses cookies and local storage to keep you signed in.",
};

export default function CookiesPage() {
  return (
    <LegalDoc id="cookies" title="Cookie Policy" intro={COOKIE_INTRO} sections={COOKIE_SECTIONS} />
  );
}
