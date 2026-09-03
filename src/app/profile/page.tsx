"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { CardAnalyticsReport } from "@/components/card-analytics-report";
import { GoogleLocationSelect } from "@/components/google-locations-settings";
import { StaffPhotoField } from "@/components/staff-photo-field";
import { cardUrl } from "@/lib/card";
import { mintPersonCardSlug } from "@/lib/card-slug";
import { useCrm } from "@/lib/crm-store";
import { formatPhone } from "@/lib/format";
import { copyText } from "@/lib/share";

export default function ProfilePage() {
  const crm = useCrm();
  const member = crm.viewer;
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name);
    setTitle(member.title);
    setPhone(member.phone);
    setEmailSignature(member.emailSignature ?? "");
    setLocationId(member.googleLocationId ?? null);
  }, [member]);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!member) {
    return (
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Sign in to add the name and phone that print on estimates you own."
      />
    );
  }

  const seat = member;
  const dirty =
    name.trim() !== seat.name ||
    title.trim() !== seat.title ||
    phone.trim() !== seat.phone ||
    emailSignature !== (seat.emailSignature ?? "") ||
    locationId !== (seat.googleLocationId ?? null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await crm.updateStaffAccount(seat.id, {
        name: name.trim(),
        title: title.trim(),
        phone: phone.trim(),
        emailSignature,
        googleLocationId: locationId,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Your photo and name front your digital business card. Name, title, and direct phone print on estimates and invoices for jobs you own. Your email signature signs off mail you send from Inbox."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Photo</CardTitle>
            <CardDescription>
              Your headshot on your digital business card. Saves on its own — no need to hit Save
              profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <StaffPhotoField
              member={seat}
              description="Homeowners see this at the top of your card, and it rides along when they save your contact."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Your contact</CardTitle>
            <CardDescription>
              Homeowners see this block on the proposal — not the company main line, unless you leave
              phone blank.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-title">Title</Label>
              <Input
                id="profile-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Project Manager"
                autoComplete="organization-title"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(303) 555-0142"
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Direct or mobile. Preview: {formatPhone(phone) === "—" ? "office line on the letterhead" : formatPhone(phone)}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={seat.email} readOnly />
              <p className="text-xs text-muted-foreground">
                Login email. A company admin can change it under Settings → People.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Google location</CardTitle>
            <CardDescription>
              Which listing the review button on your card opens. Leave it on the default unless
              your office collects reviews on its own listing.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 pt-4">
            <Label htmlFor="profile-location">Location</Label>
            <GoogleLocationSelect
              id="profile-location"
              value={locationId}
              locations={crm.googleLocations}
              onChange={setLocationId}
              full
            />
            <p className="text-xs text-muted-foreground">
              {crm.googleLocations.length === 0
                ? "No locations yet. A company admin adds them under Settings → Locations."
                : "A company admin manages the list under Settings → Locations."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Email signature</CardTitle>
            <CardDescription>
              Sign-off on mail you send from Inbox. Leave blank to use the company default from
              Settings → Company.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 pt-4">
            <Label htmlFor="profile-email-signature">Your signature</Label>
            <Textarea
              id="profile-email-signature"
              rows={5}
              className="field-sizing-fixed min-h-28 resize-y"
              value={emailSignature}
              placeholder={
                crm.company.defaultEmailSignature?.trim() ||
                "Best,\n" + (seat.name || "Your name")
              }
              onChange={(event) => setEmailSignature(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {emailSignature.trim()
                ? "This seat’s signature is used instead of the company default."
                : crm.company.defaultEmailSignature?.trim()
                  ? "Blank — new mail will use the company default until you save one here."
                  : "No company default is set. New mail will have no sign-off until someone adds one."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Public card</CardTitle>
            <CardDescription>
              Tap-to-call card at a stable URL. Renaming you here does not change the link — a company
              admin can edit it under People.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4">
            <CardLinkRow companySlug={crm.company.slug} member={seat} onMint={async (cardSlug) => {
              await crm.updateStaffAccount(seat.id, { cardSlug });
            }} />
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !dirty || !name.trim()}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setName(seat.name);
                setTitle(seat.title);
                setPhone(seat.phone);
                setEmailSignature(seat.emailSignature ?? "");
                setLocationId(seat.googleLocationId ?? null);
              }}
            >
              Discard
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">No unsaved changes.</p>
          )}
        </div>
      </form>

      <div className="max-w-2xl">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Card activity</CardTitle>
            <CardDescription>What people did after opening your card.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <CardAnalyticsReport staffId={seat.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CardLinkRow({
  companySlug,
  member,
  onMint,
}: {
  companySlug: string;
  member: { id: string; name: string; cardSlug: string; locked: boolean };
  onMint: (cardSlug: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const url =
    companySlug && member.cardSlug
      ? cardUrl(companySlug, member.cardSlug, typeof window !== "undefined" ? window.location.origin : "")
      : "";

  async function copy() {
    if (member.locked) {
      toast.error("Locked seats do not have a live card.");
      return;
    }
    if (!companySlug) {
      toast.error("A company admin needs to set the company card URL under Settings → Company.");
      return;
    }
    let personSlug = member.cardSlug.trim();
    if (!personSlug) {
      setPending(true);
      try {
        personSlug = mintPersonCardSlug(member.name);
        await onMint(personSlug);
      } finally {
        setPending(false);
      }
    }
    const live = cardUrl(companySlug, personSlug, window.location.origin);
    const ok = await copyText(live);
    if (ok) toast.success("Card link copied.");
    else toast.error("Could not copy the link. Select it and copy it yourself.");
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="profile-card-url">Card link</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="profile-card-url"
          readOnly
          value={url || (companySlug ? `/${companySlug}/card/${member.cardSlug || "first.last"}` : "Not set yet")}
          onFocus={(event) => event.target.select()}
        />
        <Button type="button" variant="outline" disabled={pending || member.locked} onClick={() => void copy()}>
          <Copy />
          {pending ? "Saving…" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
