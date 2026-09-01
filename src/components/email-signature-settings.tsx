"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCrm } from "@/lib/crm-store";
import type { StaffMember } from "@/lib/types";

export function EmailSignatureRoster() {
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
  const companyDefault = crm.company.defaultEmailSignature?.trim() ?? "";

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Email signatures</CardTitle>
        <CardDescription>
          Set a sign-off for each person. Blank uses the company default from Settings → Company.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y pt-0">
        {people.length === 0 ? (
          <p className="pt-4 text-sm text-muted-foreground">No seats yet.</p>
        ) : (
          people.map((member) => (
            <PersonSignatureRow
              key={member.id}
              member={member}
              placeholder={companyDefault || "Best,\nNorthline Construction"}
              onSave={(emailSignature) => crm.updateStaffAccount(member.id, { emailSignature })}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PersonSignatureRow({
  member,
  placeholder,
  onSave,
}: {
  member: StaffMember;
  placeholder: string;
  onSave: (emailSignature: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(member.emailSignature ?? "");
  const [pending, setPending] = useState(false);
  const dirty = value !== (member.emailSignature ?? "");

  useEffect(() => {
    setValue(member.emailSignature ?? "");
  }, [member.emailSignature]);

  async function save() {
    setPending(true);
    try {
      const ok = await onSave(value);
      if (!ok) return;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2 py-4 first:pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={`sig-${member.id}`} className="text-sm font-medium">
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
              onClick={() => setValue(member.emailSignature ?? "")}
            >
              Discard
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={pending || !dirty} onClick={() => void save()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <Textarea
        id={`sig-${member.id}`}
        rows={4}
        className="field-sizing-fixed min-h-24 resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}
