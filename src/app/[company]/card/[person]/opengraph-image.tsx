import { ImageResponse } from "next/og";
import { cardHeaderLogo } from "@/lib/card";
import { formatPhone } from "@/lib/format";
import { loadSharedCard } from "@/lib/share-server";

export const alt = "Digital business card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INK = "#1c1917";
const MUTED = "#6b7280";
const PAPER = "#ffffff";

export default async function CardPreviewImage({
  params,
}: {
  params: Promise<{ company: string; person: string }>;
}) {
  const { company: companySlug, person: personSlug } = await params;
  const card = await loadSharedCard(companySlug, personSlug);
  const company = card?.company;
  const person = card?.available ? card.person : null;
  const logo = company ? cardHeaderLogo(company) : "";
  const companyName = company?.name?.trim() ?? "";
  const phone = person?.phone?.trim() ? formatPhone(person.phone) : formatPhone(company?.phone ?? "");
  const website = company?.website?.trim().replace(/^https?:\/\//i, "") ?? "";
  const footer = [website, phone === "—" ? "" : phone].filter(Boolean).join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          padding: "70px 80px",
          background: PAPER,
          color: INK,
          fontSize: 32,
        }}
      >
        {logo ? (
          <img
            src={logo}
            alt=""
            width={760}
            height={190}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <div style={{ display: "flex", fontSize: 64, fontWeight: 600, textAlign: "center" }}>
            {companyName || "Digital card"}
          </div>
        )}

        {person ? (
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            {person.photoUrl ? (
              <img
                src={person.photoUrl}
                alt=""
                width={168}
                height={168}
                style={{ objectFit: "cover", borderRadius: 84 }}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 68, fontWeight: 600 }}>{person.name}</div>
              {person.title ? (
                <div style={{ display: "flex", fontSize: 34, color: MUTED, marginTop: 8 }}>
                  {person.title}
                </div>
              ) : null}
              {logo && companyName ? (
                <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 6 }}>
                  {companyName}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {footer ? (
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>{footer}</div>
        ) : null}
      </div>
    ),
    size,
  );
}
