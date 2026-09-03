"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import type { GoogleLocation, StaffMember } from "@/lib/types";

/** Sentinel because a Select cannot hold an empty string value. */
export const DEFAULT_LOCATION = "__default__";

export function GoogleLocationSelect({
  id,
  value,
  locations,
  onChange,
  full,
}: {
  id?: string;
  value: string | null | undefined;
  locations: GoogleLocation[];
  onChange: (locationId: string | null) => void;
  full?: boolean;
}) {
  const fallback = locations.find((location) => location.isDefault);
  // Distinct from picking that listing outright: this one follows the default if it moves.
  const noneLabel = fallback ? `Use the default (${fallback.name})` : "Use the default";
  const options = [...locations].sort((left, right) => left.name.localeCompare(right.name));
  const current = value && options.some((item) => item.id === value) ? value : DEFAULT_LOCATION;

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        const picked = String(next ?? DEFAULT_LOCATION);
        onChange(picked === DEFAULT_LOCATION ? null : picked);
      }}
      items={[
        { value: DEFAULT_LOCATION, label: noneLabel },
        ...options.map((location) => ({ value: location.id, label: location.name })),
      ]}
    >
      <SelectTrigger id={id} className={full ? "w-full" : "w-56"}>
        <SelectValue placeholder={noneLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_LOCATION}>{noneLabel}</SelectItem>
        {options.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GoogleLocationsSettings() {
  const crm = useCrm();
  const locations = crm.googleLocations;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Google locations</CardTitle>
          <CardDescription>
            One entry per Google Business Profile listing. Create the offices here, then set a
            person’s location on their profile under Settings → People. Anyone without one of their
            own uses the default.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {locations.length === 0 ? (
            <EmptyState
              title="No locations yet"
              description="Add your first listing below. In Google Business Profile choose Ask for reviews and paste the short link."
            />
          ) : (
            <ul className="divide-y">
              {locations.map((location) => (
                <li key={`${location.id}:${location.name}:${location.reviewUrl}`}>
                  <LocationRow
                    location={location}
                    seats={crm.staff.filter((member) => member.googleLocationId === location.id)}
                    onSave={(patch) => crm.updateGoogleLocation(location.id, patch)}
                    onRemove={() => crm.removeGoogleLocation(location.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddLocationCard onAdd={crm.addGoogleLocation} />
    </div>
  );
}

function LocationRow({
  location,
  seats,
  onSave,
  onRemove,
}: {
  location: GoogleLocation;
  seats: StaffMember[];
  onSave: (patch: { name?: string; reviewUrl?: string; isDefault?: boolean }) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  // Keyed by the parent on saved values, so a save resets this draft.
  const [name, setName] = useState(location.name);
  const [reviewUrl, setReviewUrl] = useState(location.reviewUrl);
  const [pending, setPending] = useState(false);
  const dirty = name !== location.name || reviewUrl !== location.reviewUrl;

  async function run(action: () => Promise<boolean>) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-3 py-4 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{location.name}</span>
          {location.isDefault ? <Badge variant="secondary">Default</Badge> : null}
          <span className="text-xs text-muted-foreground">
            {seats.length === 0
              ? location.isDefault
                ? "Everyone without their own"
                : "No one assigned"
              : `${seats.length} ${seats.length === 1 ? "person" : "people"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {location.isDefault ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => void run(() => onSave({ isDefault: true }))}
            >
              Make default
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${location.name}`}
            disabled={pending}
            onClick={() => void run(onRemove)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`location-name-${location.id}`}>Name</Label>
          <Input
            id={`location-name-${location.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Denver office"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`location-url-${location.id}`}>Review link</Label>
          <Input
            id={`location-url-${location.id}`}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={reviewUrl}
            onChange={(event) => setReviewUrl(event.target.value)}
            placeholder="https://g.page/r/…/review"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !dirty || !name.trim()}
          onClick={() => void run(() => onSave({ name, reviewUrl }))}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function AddLocationCard({
  onAdd,
}: {
  onAdd: (input: { name: string; reviewUrl: string }) => Promise<GoogleLocation | null>;
}) {
  const [name, setName] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [pending, setPending] = useState(false);

  async function add() {
    setPending(true);
    try {
      const created = await onAdd({ name, reviewUrl });
      if (created) {
        setName("");
        setReviewUrl("");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Add a location</CardTitle>
        <CardDescription>
          Name it the way your crews say it — Denver, North Shop, the city. Homeowners only see the
          review page it opens.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="new-location-name">Name</Label>
            <Input
              id="new-location-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Denver office"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-location-url">Review link</Label>
            <Input
              id="new-location-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={reviewUrl}
              onChange={(event) => setReviewUrl(event.target.value)}
              placeholder="https://g.page/r/…/review"
            />
          </div>
          <Button type="button" disabled={pending || !name.trim()} onClick={() => void add()}>
            <Plus />
            {pending ? "Adding…" : "Add location"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
