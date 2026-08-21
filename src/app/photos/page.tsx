"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoCategoryBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatDate, initials } from "@/lib/format";
import { isDeletedJob } from "@/lib/job-record";
import {
  groupPhotosByDay,
  PHOTO_DATE_RANGE_LABELS,
  PHOTO_TAG_FILTERS,
  photoInDateRange,
  photoJobLabel,
  photoTimeLabel,
  type PhotoDateRange,
  type PhotoFeedItem,
} from "@/lib/photos-feed";
import { PHOTO_CATEGORY_LABELS, type PhotoCategory } from "@/lib/types";

export default function PhotosPage() {
  const crm = useCrm();
  const router = useRouter();
  const [range, setRange] = useState<PhotoDateRange>("all");
  const [jobId, setJobId] = useState("all");
  const [userName, setUserName] = useState("all");
  const [tag, setTag] = useState<"all" | PhotoCategory>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const jobsById = useMemo(() => {
    const map = new Map(crm.book.jobs.map((job) => [job.id, job]));
    return map;
  }, [crm.book.jobs]);
  const contactsById = useMemo(() => {
    const map = new Map(crm.book.contacts.map((contact) => [contact.id, contact]));
    return map;
  }, [crm.book.contacts]);

  const items = useMemo(() => {
    return crm.photos.map((photo) => {
      const job = jobsById.get(photo.jobId);
      const contact = job?.primaryContactId ? contactsById.get(job.primaryContactId) : undefined;
      const feed: PhotoFeedItem = {
        photo,
        job,
        contact,
        label: photoJobLabel(job, contact),
        photographer: photo.createdBy?.trim() || "",
      };
      return feed;
    });
  }, [contactsById, crm.photos, jobsById]);

  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (!seen.has(item.photo.jobId)) seen.set(item.photo.jobId, item.label);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const userOptions = useMemo(() => {
    const names = new Set(
      items.map((item) => item.photographer).filter(Boolean),
    );
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!photoInDateRange(item.photo.takenAt, range)) return false;
      if (jobId !== "all" && item.photo.jobId !== jobId) return false;
      if (userName !== "all" && item.photographer !== userName) return false;
      if (tag !== "all" && item.photo.category !== tag) return false;
      return true;
    });
  }, [items, jobId, range, tag, userName]);

  const groups = useMemo(() => groupPhotosByDay(filtered), [filtered]);
  const openItem = filtered.find((item) => item.photo.id === openId) ?? items.find((item) => item.photo.id === openId);
  const canOpenJob = Boolean(
    openItem && crm.getJob(openItem.photo.jobId) && !isDeletedJob(openItem.job ?? { deletedAt: null }),
  );

  if (!crm.hydrated) return <LoadingScreen />;

  const filtersActive = range !== "all" || jobId !== "all" || userName !== "all" || tag !== "all";

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Field"
        title="Photos"
        description="Every shot from the company, newest first. Job books stay private — you can open a job from here only if it is already in your seat."
      />

      <div className="flex flex-wrap gap-2">
        <Select
          value={range}
          onValueChange={(value) => setRange((value as PhotoDateRange) ?? "all")}
          items={Object.entries(PHOTO_DATE_RANGE_LABELS).map(([value, label]) => ({ value, label }))}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PHOTO_DATE_RANGE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={jobId}
          onValueChange={(value) => setJobId(value ?? "all")}
          items={[{ value: "all", label: "All jobs" }, ...jobOptions.map(([id, label]) => ({ value: id, label }))]}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobOptions.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={userName}
          onValueChange={(value) => setUserName(value ?? "all")}
          items={[{ value: "all", label: "All people" }, ...userOptions.map((name) => ({ value: name, label: name }))]}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All people</SelectItem>
            {userOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tag}
          onValueChange={(value) => setTag((value as "all" | PhotoCategory) ?? "all")}
          items={PHOTO_TAG_FILTERS.map((item) => ({ value: item.value, label: item.label }))}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PHOTO_TAG_FILTERS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No photos in this company yet"
          description="Add photos from a job record. They show up here for everyone in the company, even if they cannot open that job."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No photos match these filters"
          description={filtersActive ? "Widen the date, job, person, or tag filters." : "No photos to show."}
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-3 text-sm font-medium">{group.label}</h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {group.items.map((item) => {
                  const time = photoTimeLabel(item.photo.takenAt);
                  const meta = [time, item.photographer || PHOTO_CATEGORY_LABELS[item.photo.category]]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={item.photo.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(item.photo.id)}
                        className="group relative block aspect-square w-full overflow-hidden rounded-md bg-muted text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.photo.imageUrl}
                          alt={item.photo.caption || item.label}
                          className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                        />
                        <span className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 text-white">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-medium">
                            {initials(item.photographer || item.label) || "•"}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{item.label}</span>
                            <span className="block truncate text-[10px] text-white/75">{meta}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={Boolean(openItem)} onOpenChange={(open) => { if (!open) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-3xl">
          {openItem ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={openItem.photo.imageUrl}
                alt={openItem.photo.caption || openItem.label}
                className="max-h-[70vh] w-full object-contain bg-black"
              />
              <div className="space-y-3 p-5">
                <DialogHeader className="p-0">
                  <DialogTitle>{openItem.photo.caption || openItem.label}</DialogTitle>
                  <DialogDescription>
                    {openItem.label}
                    {openItem.job?.code ? ` · ${openItem.job.code}` : ""}
                    {openItem.photographer ? ` · ${openItem.photographer}` : ""}
                    {` · ${formatDate(openItem.photo.takenAt)}`}
                    {photoTimeLabel(openItem.photo.takenAt) ? ` ${photoTimeLabel(openItem.photo.takenAt)}` : ""}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <PhotoCategoryBadge category={openItem.photo.category} />
                  {canOpenJob ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setOpenId(null);
                        router.push(`/jobs?job=${openItem.photo.jobId}`);
                      }}
                    >
                      Open job
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">This job is not in your book. The photo is still here for the company.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
