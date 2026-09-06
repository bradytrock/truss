"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMarketing } from "@/lib/marketing/store";
import type { MarketingSocialPost } from "@/lib/marketing/types";

export default function MarketingSocialPage() {
  const marketing = useMarketing();
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<MarketingSocialPost["channel"]>("instagram");
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  function addPost() {
    if (!title.trim() || !body.trim()) {
      toast.error("Add a title and post body");
      return;
    }
    marketing.saveSocialPost({
      id: marketing.newId("social"),
      title: title.trim(),
      channel,
      body: body.trim(),
      materialId: null,
      scheduledFor: scheduledFor || new Date().toISOString(),
      status: scheduledFor ? "scheduled" : "idea",
      createdAt: new Date().toISOString(),
    });
    setTitle("");
    setBody("");
    setScheduledFor("");
    toast.success("Added to social calendar");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="font-heading text-lg font-medium">Schedule a post</h2>
        <div className="space-y-1.5">
          <Label htmlFor="social-title">Title</Label>
          <Input id="social-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="social-channel">Channel</Label>
          <select
            id="social-channel"
            className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            value={channel}
            onChange={(event) => setChannel(event.target.value as MarketingSocialPost["channel"])}
          >
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="linkedin">LinkedIn</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="social-when">Schedule (optional)</Label>
          <Input
            id="social-when"
            type="datetime-local"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="social-body">Body</Label>
          <Textarea
            id="social-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-28"
          />
        </div>
        <Button type="button" onClick={addPost}>
          Add to calendar
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Calendar</h2>
        {marketing.socialPosts.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            description="Turn a finished job into a social square, then drop the copy here."
          />
        ) : (
          <ul className="space-y-2">
            {marketing.socialPosts.map((post) => (
              <li key={post.id} className="rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{post.title}</p>
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    {post.channel} · {post.status}
                  </span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{post.body}</p>
                {post.scheduledFor ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(post.scheduledFor).toLocaleString()}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
