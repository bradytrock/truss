"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LOGO_ACCEPT } from "@/lib/company-logo";
import { useCrm } from "@/lib/crm-store";
import { initials } from "@/lib/format";
import type { StaffMember } from "@/lib/types";

export function StaffPhotoField({
  member,
  description = "Shows on their digital business card and on the contact they save to a phone.",
}: {
  member: StaffMember;
  description?: string;
}) {
  const crm = useCrm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photo = member.photoUrl?.trim() ?? "";

  async function pick(file: File) {
    setBusy(true);
    try {
      await crm.uploadStaffPhoto(member.id, file);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await crm.removeStaffPhoto(member.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={member.name}
          className="size-20 shrink-0 rounded-full border object-cover"
        />
      ) : (
        <div className="font-heading flex size-20 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-xl">
          {initials(member.name) || "?"}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void pick(file);
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Uploading…" : photo ? "Replace photo" : "Upload photo"}
        </Button>
        {photo ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void clear()}>
            Remove
          </Button>
        ) : null}
        <p className="basis-full text-xs text-muted-foreground">
          {description} A square headshot under 2 MB works best.
        </p>
      </div>
    </div>
  );
}

export function StaffPhotoRoster() {
  const crm = useCrm();
  const people = useMemo(
    () =>
      [...crm.staff].sort((left, right) => {
        if (left.id === crm.viewer?.id) return -1;
        if (right.id === crm.viewer?.id) return 1;
        return left.name.localeCompare(right.name);
      }),
    [crm.staff, crm.viewer?.id],
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Card photos</CardTitle>
        <CardDescription>
          A headshot for each person’s digital business card. Blank shows their initials instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y pt-0">
        {people.length === 0 ? (
          <p className="pt-4 text-sm text-muted-foreground">No seats yet.</p>
        ) : (
          people.map((member) => (
            <div key={member.id} className="grid gap-2 py-4 first:pt-4">
              <p className="text-sm font-medium">
                {member.name}
                {member.title ? (
                  <span className="ml-2 font-normal text-muted-foreground">{member.title}</span>
                ) : null}
              </p>
              <StaffPhotoField
                member={member}
                description={`Tops ${member.name}’s card.`}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
