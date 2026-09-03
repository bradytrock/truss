"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
