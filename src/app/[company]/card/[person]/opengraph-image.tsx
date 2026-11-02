import { ImageResponse } from "next/og";
import { appOrigin } from "@/lib/app-origin";
import { cardHeaderLogo } from "@/lib/card";
import { cardWebsiteHost } from "@/lib/card-display";
import { formatPhone } from "@/lib/format";
import { loadSharedCard } from "@/lib/share-server";

export const alt = "Digital business card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RED = "#d7182a";
const HERO = "#1a1a1c";
const PAPER = "#ffffff";

function absolutize(url: string, origin: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return trimmed;
}

export default async function CardPreviewImage({
  params,
}: {
  params: Promise<{ company: string; person: string }>;
}) {
  const { company: companySlug, person: personSlug } = await params;
  const origin = await appOrigin();
  const card = await loadSharedCard(companySlug, personSlug);
  const company = card?.company;
  const person = card?.available ? card.person : null;
  const logo = company ? absolutize(cardHeaderLogo(company), origin) : "";
  const photo = person?.photoUrl ? absolutize(person.photoUrl, origin) : "";
  const companyName = company?.name?.trim() ?? "";
  const phone = person?.phone?.trim() ? formatPhone(person.phone) : "";
  const phoneLabel = phone === "—" ? "" : phone;
  const host = cardWebsiteHost(company?.website ?? "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: HERO,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 150,
            background: PAPER,
          }}
        >
          {logo ? (
            <img src={logo} alt="" width={520} height={110} style={{ objectFit: "contain" }} />
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 42,
                fontWeight: 700,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: HERO,
              }}
            >
              {companyName || "Digital card"}
            </div>
          )}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 48,
            padding: "36px 80px",
          }}
        >
          {person && photo ? (
            <img
              src={photo}
              alt=""
              width={250}
              height={250}
              style={{ objectFit: "cover", borderRadius: 125, border: `8px solid ${RED}` }}
            />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: person ? 64 : 56,
                fontWeight: 700,
                color: PAPER,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {person?.name || companyName || "Card isn’t available"}
            </div>
            {person?.title ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 12,
                  fontSize: 28,
                  fontWeight: 700,
                  color: RED,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}
              >
                {person.title}
              </div>
            ) : null}
            {phoneLabel || host ? (
              <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: PAPER }}>
                {[phoneLabel, host].filter(Boolean).join("   ·   ")}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
