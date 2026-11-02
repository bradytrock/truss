"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Copy, Globe, Mail, MapPin, MessageSquare, PenLine, Phone, Star, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { recordCardEvent, type CardEventKind } from "@/lib/card-analytics";
import {
  cardAddressLines,
  cardCheckRow,
  cardMapsHref,
  cardWebsiteHost,
} from "@/lib/card-display";
import {
  cardHeaderLogo,
  cardUrl,
  downloadVcard,
  smsHref,
  telHref,
  vcardText,
  websiteHref,
  type SharedCardPayload,
} from "@/lib/card";
import { embedVcardPhoto } from "@/lib/card-vcard-photo";
import { formatPhone } from "@/lib/format";
import { paymentOptions, resolveGoogleReviewUrl, type PaymentOption, type PaymentRail } from "@/lib/payments";
import { copyText } from "@/lib/share";
import { socialLinks, type SocialLink } from "@/lib/social";

const RED = "#d7182a";
const HERO = "#1a1a1c";
const TILE = "#2a2a2d";
const CANVAS = "#f1f0ed";
const CARD_SHADOW = "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)";

const PAY_MARK: Record<PaymentRail, { bg: string; mark: string }> = {
  venmo: { bg: "#028cff", mark: "V" },
  zelle: { bg: "#6d1ed4", mark: "Z" },
  cashapp: { bg: "#00c244", mark: "$" },
  paypal: { bg: "#003087", mark: "P" },
};

function CardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 justify-center bg-[#e6e4e0] sm:px-4 sm:py-8">
      <div className="flex w-full max-w-[430px] min-h-dvh flex-col bg-[#f1f0ed] sm:min-h-[720px] sm:overflow-hidden sm:rounded-[28px] sm:shadow-[0_18px_50px_rgba(0,0,0,0.14)]">
        {children}
      </div>
    </div>
  );
}

function LogoBand({ logo, name }: { logo: string; name: string }) {
  if (!logo && !name) return null;
  return (
    <div className="flex h-20 shrink-0 items-center justify-center bg-white px-8">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={name} className="max-h-12 w-auto max-w-[220px] object-contain" />
      ) : (
        <p className="text-center text-[13px] font-bold tracking-[0.16em] text-[#1a1a1c] uppercase">
          {name}
        </p>
      )}
    </div>
  );
}

function Unavailable({ logo, name, detail }: { logo: string; name: string; detail: string }) {
  return (
    <CardFrame>
      <LogoBand logo={logo} name={name} />
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1c]">This card isn’t available</h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#6f6f6f]">{detail}</p>
      </div>
    </CardFrame>
  );
}

export function BusinessCardView({ card }: { card: SharedCardPayload }) {
  const company = card.company;
  const person = card.person;
  const headerLogo = cardHeaderLogo(company);
  const personSlug = person?.cardSlug ?? "";
  const viewSent = useRef(false);
  const [savingContact, setSavingContact] = useState(false);

  const track = useCallback(
    (kind: CardEventKind, detail?: string) => {
      recordCardEvent({ company: company.slug, person: personSlug, kind, detail });
    },
    [company.slug, personSlug],
  );

  useEffect(() => {
    // One open per mount: StrictMode runs effects twice in development.
    if (viewSent.current || !personSlug) return;
    viewSent.current = true;
    track("view");
  }, [personSlug, track]);

  if (!card.available || !person) {
    return (
      <Unavailable
        logo={headerLogo}
        name={company.name}
        detail={
          company.name
            ? `This person is no longer with ${company.name}, or the link is out of date.`
            : "This person is no longer with the company, or the link is out of date."
        }
      />
    );
  }

  const live = person;
  const call = telHref(live.phone);
  const text = smsHref(live.phone);
  const url = cardUrl(company.slug, live.cardSlug);
  const phoneLabel = live.phone.trim() ? formatPhone(live.phone) : "";
  const showPhone = Boolean(phoneLabel && phoneLabel !== "—");
  const address = cardAddressLines(company);
  const mapsHref = cardMapsHref(address);
  const reviewUrl = resolveGoogleReviewUrl(company, live);
  const payments = paymentOptions(company);
  const note = cardCheckRow(company.paymentNote);
  const follow = socialLinks(company);
  const siteHost = cardWebsiteHost(company.website);
  const siteHref = websiteHref(company.website);

  async function saveContact() {
    if (savingContact) return;
    setSavingContact(true);
    track("save_contact");
    try {
      const photo = await embedVcardPhoto(live.photoUrl);
      downloadVcard(
        live.cardSlug || live.name,
        vcardText({
          person: live,
          company,
          url: typeof window !== "undefined" ? window.location.href : url,
          photo,
        }),
      );
    } finally {
      setSavingContact(false);
    }
  }

  const actions: ReactNode[] = [];
  if (call) {
    actions.push(
      <ActionTile key="call" href={call} tone="primary" label="Call" onClick={() => track("call")}>
        <Phone className="size-[22px]" strokeWidth={2.25} />
      </ActionTile>,
    );
  }
  if (text) {
    actions.push(
      <ActionTile key="text" href={text} label="Text" onClick={() => track("text")}>
        <MessageSquare className="size-[22px]" strokeWidth={2.25} />
      </ActionTile>,
    );
  }
  if (live.email) {
    actions.push(
      <ActionTile
        key="email"
        href={`mailto:${live.email}`}
        label="Email"
        onClick={() => track("email")}
      >
        <Mail className="size-[22px]" strokeWidth={2.25} />
      </ActionTile>,
    );
  }
  actions.push(
    <ActionTile
      key="save"
      label={savingContact ? "Saving…" : "Save"}
      disabled={savingContact}
      onClick={() => void saveContact()}
    >
      <UserPlus className="size-[22px]" strokeWidth={2.25} />
    </ActionTile>,
  );

  return (
    <CardFrame>
      <article className="flex min-h-full flex-1 flex-col">
        <LogoBand logo={headerLogo} name={company.name} />
        <header className="px-5 pt-8 pb-7 text-center" style={{ background: HERO }}>
          {live.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={live.photoUrl}
              alt=""
              className="mx-auto size-[128px] rounded-full border-[3px] object-cover"
              style={{ borderColor: RED }}
            />
          ) : (
            <div
              className="mx-auto flex size-[128px] items-center justify-center rounded-full border-[3px] text-3xl font-semibold text-white"
              style={{ borderColor: RED, background: TILE }}
            >
              {live.initials}
            </div>
          )}
          <h1 className="mt-6 text-[1.85rem] leading-none font-bold tracking-[0.02em] text-balance text-white uppercase">
            {live.name}
          </h1>
          {live.title ? (
            <p
              className="mt-2.5 text-[12px] font-bold tracking-[0.18em] text-balance uppercase"
              style={{ color: RED }}
            >
              {live.title}
            </p>
          ) : null}
          <div
            className="mt-6 grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`,
              // One action stays a tile. Stretching it across the hero reads as a banner.
              ...(actions.length === 1 ? { width: 88, marginInline: "auto" } : {}),
            }}
          >
            {actions}
          </div>
          {showPhone ? (
            <p className="mt-4 text-[15px] font-medium tracking-wide text-white">{phoneLabel}</p>
          ) : null}
        </header>

        <div className="flex flex-1 flex-col px-5 pt-4 pb-8" style={{ background: CANVAS }}>
          {reviewUrl ? (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("review")}
              className="flex items-center gap-3 rounded-[16px] bg-white px-4 py-3.5 transition-colors hover:bg-[#fafafa]"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <span className="min-w-0 flex-1 text-left">
                <span className="flex gap-0.5" aria-hidden>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} className="size-[18px] fill-[#e8a51d] text-[#e8a51d]" strokeWidth={0} />
                  ))}
                </span>
                <span className="mt-1.5 block text-[15px] leading-tight font-bold tracking-wide text-[#1a1a1c] uppercase">
                  How&apos;d we do?
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-[#6f6f6f]">
                  Leave a Google review — it takes 30 seconds.
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-[#c5c5c5]" />
            </a>
          ) : null}

          {payments.length > 0 || note ? (
            <section className={reviewUrl ? "mt-5" : ""}>
              <h2 className="px-1 text-[11px] font-semibold tracking-[0.16em] text-[#8d8d8d] uppercase">
                Pay {company.name || "us"}
              </h2>
              <ul className="mt-2.5 grid gap-2.5">
                {payments.map((option) => (
                  <li key={option.rail}>
                    <PaymentRow option={option} onUse={() => track("payment", option.rail)} />
                  </li>
                ))}
                {note ? (
                  <li>
                    <NoteRow title={note.title} detail={note.detail} />
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {follow.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2.5">
              {follow.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => track(link.key === "website" ? "website" : "social", link.key)}
                    className="flex min-h-[52px] items-center justify-center gap-1.5 rounded-[16px] bg-white px-2 text-[13px] font-medium text-[#1a1a1c] transition-colors hover:bg-[#fafafa]"
                    style={{ boxShadow: CARD_SHADOW }}
                  >
                    <SocialGlyph network={link.key} />
                    <span className="truncate">{link.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          {mapsHref ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex items-center gap-3 px-0.5"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: HERO }}
              >
                <MapPin className="size-4" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 text-left text-[14px] leading-snug text-[#2a2a2a]">
                {address.street ? <span className="block">{address.street}</span> : null}
                {address.locality ? <span className="block">{address.locality}</span> : null}
              </span>
            </a>
          ) : null}

          {siteHost && siteHref ? (
            <a
              href={siteHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("website")}
              className="mt-8 block text-center text-[11px] font-semibold tracking-[0.22em] text-[#a3a3a3] uppercase"
            >
              {siteHost}
            </a>
          ) : null}
        </div>
      </article>
    </CardFrame>
  );
}

function ActionTile({
  href,
  label,
  tone = "quiet",
  disabled,
  onClick,
  children,
}: {
  href?: string;
  label: string;
  tone?: "primary" | "quiet";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className =
    "flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-[12px] text-[13px] font-medium text-white transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] disabled:opacity-60";
  const style = { background: tone === "primary" ? RED : TILE };
  if (href) {
    return (
      <a href={href} onClick={onClick} className={className} style={style}>
        {children}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} style={style}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function PaymentRow({ option, onUse }: { option: PaymentOption; onUse: () => void }) {
  async function copyHandle(event: { preventDefault: () => void; stopPropagation: () => void }) {
    event.preventDefault();
    event.stopPropagation();
    onUse();
    const ok = await copyText(option.handle);
    if (ok) toast.success(`${option.label} copied: ${option.handle}`);
    else toast.error(`Copy this into ${option.label}: ${option.handle}`);
  }

  const body = (
    <>
      <PayMark rail={option.rail} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] leading-tight font-semibold text-[#1a1a1c]">{option.label}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[#8a8a8a]">{option.handle}</span>
      </span>
    </>
  );

  return (
    <div
      className="flex items-center gap-1 rounded-[16px] bg-white py-2.5 pr-1.5 pl-3.5"
      style={{ boxShadow: CARD_SHADOW }}
    >
      {option.href ? (
        <a
          href={option.href}
          target="_blank"
          rel="noreferrer"
          onClick={onUse}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {body}
        </a>
      ) : (
        <button type="button" onClick={copyHandle} className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </button>
      )}
      <button
        type="button"
        onClick={copyHandle}
        aria-label={`Copy ${option.label}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[#b5b5b5] hover:bg-[#f4f3f1] hover:text-[#1a1a1c]"
      >
        <Copy className="size-[18px]" />
      </button>
    </div>
  );
}

function PayMark({ rail }: { rail: PaymentRail }) {
  const mark = PAY_MARK[rail];
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
      style={{ background: mark.bg }}
      aria-hidden
    >
      {mark.mark}
    </span>
  );
}

function NoteRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[16px] bg-white px-3.5 py-3"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#eceae6] text-[#5c5c5c]">
        <PenLine className="size-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[15px] leading-tight font-semibold text-[#1a1a1c]">{title}</span>
        {detail ? <span className="mt-0.5 block text-[13px] text-[#8a8a8a]">{detail}</span> : null}
      </span>
    </div>
  );
}

function SocialGlyph({ network }: { network: SocialLink["key"] }) {
  if (network === "website") return <Globe className="size-[18px]" strokeWidth={1.75} />;
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      {network === "facebook" ? (
        <path
          fill="currentColor"
          d="M14.5 8.5V6.8c0-.7.5-1 1.2-1H17V3h-2.1C12.4 3 11 4.5 11 6.7v1.8H9V11h2v8h2.6v-8h2.1l.4-2.5h-2.6z"
        />
      ) : null}
      {network === "instagram" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" />
        </>
      ) : null}
      {network === "youtube" ? (
        <>
          <rect x="3" y="6.5" width="18" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path fill="currentColor" d="M11 10.2v3.6l3.2-1.8z" />
        </>
      ) : null}
      {network === "linkedin" ? (
        <path
          fill="currentColor"
          d="M6.7 9.2H4.2V20h2.5V9.2zM5.4 3.8A1.5 1.5 0 1 0 5.4 6.8 1.5 1.5 0 0 0 5.4 3.8zM20 20h-2.5v-5.5c0-1.5-.6-2.5-2-2.5-1 0-1.6.7-1.9 1.3-.1.2-.1.6-.1.9V20H11V9.2h2.4v1.5c.4-.7 1.4-1.8 3.3-1.8 2.4 0 4.3 1.6 4.3 4.9V20z"
        />
      ) : null}
      {network === "tiktok" ? (
        <path
          fill="currentColor"
          d="M14.2 3.5c.4 2.4 1.8 4 4.1 4.3v2.4c-1.4 0-2.7-.4-3.9-1.2v6.4c0 3.3-2.5 5.7-5.7 5.7S3 18.7 3 15.4c0-3.2 2.5-5.6 5.6-5.7v2.6c-1.6.1-2.9 1.4-2.9 3.1 0 1.8 1.4 3.2 3.1 3.2s3-1.3 3-3.1V3.5h2.4z"
        />
      ) : null}
    </svg>
  );
}

export function BusinessCardMissing() {
  return (
    <Unavailable
      logo=""
      name=""
      detail="This person is no longer with the company, or the link is out of date."
    />
  );
}
