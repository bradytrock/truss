"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  persistSupabaseBrowserConfig,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";

export function ConnectSupabaseForm({ onConnected }: { onConnected?: () => void }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const projectUrl = normalizeSupabaseUrl(url);
    const publishableKey = key.trim();
    if (!projectUrl || !publishableKey) {
      toast.error("Paste the project URL and the publishable (or anon) key.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/supabase/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: projectUrl, key: publishableKey }),
    });
    const payload = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      toast.error(payload.error ?? "Could not reach that project.");
      return;
    }
    persistSupabaseBrowserConfig(projectUrl, publishableKey);
    toast.success("Supabase project connected. Sign in or create an account.");
    onConnected?.();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Your project is live — paste the API URL and the <span className="text-foreground">publishable</span> or
        legacy anon key from Settings → API. Then run both files in{" "}
        <code className="text-foreground">supabase/migrations</code> in the SQL editor once.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="sb-url">Project URL</Label>
        <Input
          id="sb-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://xxxx.supabase.co"
          autoComplete="off"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sb-key">Publishable or anon key</Label>
        <Input
          id="sb-key"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="sb_publishable_… or eyJ…"
          autoComplete="off"
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking project…" : "Connect project"}
      </Button>
    </form>
  );
}
