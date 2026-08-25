"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatPhone } from "@/lib/format";

export default function ProfilePage() {
  const crm = useCrm();
  const member = crm.viewer;
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name);
    setTitle(member.title);
    setPhone(member.phone);
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
    name.trim() !== seat.name || title.trim() !== seat.title || phone.trim() !== seat.phone;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await crm.updateStaffAccount(seat.id, {
        name: name.trim(),
        title: title.trim(),
        phone: phone.trim(),
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
        description="Your name, title, and direct phone print on estimates and invoices for jobs you own."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
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
              }}
            >
              Discard
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">No unsaved changes.</p>
          )}
        </div>
      </form>
    </div>
  );
}
