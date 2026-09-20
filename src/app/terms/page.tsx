import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { TERMS_INTRO, TERMS_SECTIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement for using Truss, the contractor workspace at myroofingtools.com.",
};

export default function TermsPage() {
  return <LegalDoc id="terms" title="Terms of Service" intro={TERMS_INTRO} sections={TERMS_SECTIONS} />;
}
