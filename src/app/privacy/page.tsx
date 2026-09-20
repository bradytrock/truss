import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { PRIVACY_INTRO, PRIVACY_SECTIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Truss collects, who can see it, and how to ask for a change or deletion.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc id="privacy" title="Privacy Policy" intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS} />
  );
}
