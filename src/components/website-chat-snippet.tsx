"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { websiteChatEmbedCode } from "@/lib/website-chat";
import { copyText } from "@/lib/share";

export function WebsiteChatSnippet({
  company,
  personId = "",
  fieldId,
}: {
  company: string;
  personId?: string;
  fieldId: string;
}) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const snippet = origin ? websiteChatEmbedCode(origin, company.trim() || "your-company", personId) : "";

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>Header code</Label>
      <Textarea id={fieldId} readOnly rows={3} value={snippet} className="font-mono text-xs" />
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={!snippet}
          onClick={() => {
            void copyText(snippet).then((ok) => {
              if (ok) toast.success("Header code copied.");
              else toast.error("Could not copy that.");
            });
          }}
        >
          Copy header code
        </Button>
      </div>
    </div>
  );
}
