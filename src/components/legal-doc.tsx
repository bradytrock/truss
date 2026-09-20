import Link from "next/link";
import { BrandMark } from "@/components/brand";
import {
  LEGAL_BRAND,
  LEGAL_EMAIL,
  LEGAL_PAGES,
  LEGAL_UPDATED,
  type LegalPageId,
  type LegalSection,
} from "@/lib/legal";

export function LegalDoc({
  id,
  title,
  intro,
  sections,
}: {
  id: LegalPageId;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-dvh bg-[#f8fafc] text-[#181818]">
      <header className="border-b border-black/6 bg-white">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/login" className="hover:opacity-80">
            <BrandMark />
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LEGAL_PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className={
                  page.id === id
                    ? "font-semibold text-[#181818]"
                    : "text-[#706e6b] hover:text-[#181818] hover:underline"
                }
              >
                {page.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#706e6b] uppercase">
          {LEGAL_BRAND}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-medium tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[#706e6b]">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-[#181818]">{intro}</p>
        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="mt-2 text-[15px] leading-relaxed text-[#3f3f46]">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[#3f3f46]">
                  {section.bullets.map((item) => (
                    <li key={item.slice(0, 48)}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-[#706e6b]">
          Questions:{" "}
          <a href={`mailto:${LEGAL_EMAIL}`} className="font-medium text-[#0176d3] hover:underline">
            {LEGAL_EMAIL}
          </a>
        </p>
      </main>
    </div>
  );
}
