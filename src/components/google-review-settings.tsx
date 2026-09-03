"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCrm } from "@/lib/crm-store";
import type { StaffMember } from "@/lib/types";

export function GoogleReviewRoster() {
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
  const companyDefault = crm.company.googleReviewUrl?.trim() ?? "";

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Google review links</CardTitle>
        <CardDescription>
          Point a person at the listing for their office. Blank uses the company link from Settings
          → Company, so only the people who work out of another office need a row here.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y pt-0">
        {people.length === 0 ? (
          <p className="pt-4 text-sm text-muted-foreground">No seats yet.</p>
        ) : (
          people.map((member) => (
            <PersonReviewRow
              key={`${member.id}:${member.googleReviewUrl ?? ""}`}
              member={member}
              placeholder={companyDefault || "https://g.page/r/…/review"}
              onSave={(googleReviewUrl) => crm.updateStaffAccount(member.id, { googleReviewUrl })}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PersonReviewRow({
  member,
  placeholder,
  onSave,
}: {
  member: StaffMember;
  placeholder: string;
  onSave: (googleReviewUrl: string) => Promise<boolean>;
}) {
  // Keyed on the saved value by the parent, so a save resets this draft.
  const saved = member.googleReviewUrl ?? "";
  const [value, setValue] = useState(saved);
  const [pending, setPending] = useState(false);
  const dirty = value !== saved;

  async function save() {
    setPending(true);
    try {
      await onSave(value);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2 py-4 first:pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={`review-${member.id}`} className="text-sm font-medium">
          {member.name}
          {member.title ? (
            <span className="ml-2 font-normal text-muted-foreground">{member.title}</span>
          ) : null}
        </Label>
        <div className="flex items-center gap-2">
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setValue(saved)}
            >
              Discard
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={pending || !dirty} onClick={() => void save()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <Input
        id={`review-${member.id}`}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
      {!value.trim() ? (
        <p className="text-xs text-muted-foreground">Using the company link.</p>
      ) : null}
    </div>
  );
}
