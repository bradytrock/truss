"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PhotoReportPagePreview } from "@/components/photo-report-preview";
import { ShareFrame, ShareLoading, ShareMissing, SharePdfButton } from "@/components/share-frame";
import { useCrm } from "@/lib/crm-store";
import { letterheadCompanyForRecord } from "@/lib/document-owner";
import { downloadPhotoReportPdf } from "@/lib/photo-report-pdf";
import { companySettingsFromShared, parseSharedPage, type SharedPagePayload } from "@/lib/share";
import type { Contact, StaffMember } from "@/lib/types";

function contactsFromShared(payload: SharedPagePayload): Contact[] {
  return payload.contacts.map((contact) => ({
    id: contact.id,
    clientId: null,
    name: contact.name,
    title: contact.title,
    email: "",
    phone: contact.phone,
    ownerStaffId: "",
    isReferralPartner: false,
  }));
}

function staffFromShared(payload: SharedPagePayload): StaffMember[] {
  return payload.staff.map((member) => ({
    id: member.id,
    name: member.name,
    title: member.title,
    role: "project_manager",
    teamId: null,
    initials: member.name.slice(0, 2).toUpperCase(),
    email: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  }));
}

export default function SharedPageDocument() {
  const { token } = useParams<{ token: string }>();
  const crm = useCrm();
  const [remote, setRemote] = useState<SharedPagePayload | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "missing">("idle");

  const fromStore = useMemo(
    () => crm.photoReports.find((report) => report.shareToken === token),
    [crm.photoReports, token],
  );

  useEffect(() => {
    if (!crm.hydrated) return;
    if (fromStore) {
      setRemote(null);
      setRemoteState("idle");
      return;
    }
    let cancelled = false;
    setRemoteState("loading");
    void fetch(`/api/share/page/${encodeURIComponent(token)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const parsed = parseSharedPage(data);
        if (!parsed) {
          setRemote(null);
          setRemoteState("missing");
          return;
        }
        setRemote(parsed);
        setRemoteState("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setRemote(null);
          setRemoteState("missing");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [crm.hydrated, fromStore, token]);

  if (!crm.hydrated || (remoteState === "loading" && !fromStore && !remote)) {
    return <ShareLoading />;
  }

  if (fromStore) {
    const job = crm.jobs.find((item) => item.id === fromStore.jobId);
    if (!job) return <ShareMissing kind="page" />;
    const photos = crm.photos.filter((photo) => photo.jobId === job.id);
    const opportunity = job.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) : undefined;
    const letterhead = letterheadCompanyForRecord({
      company: crm.company,
      job,
      opportunity,
      staff: crm.staff,
      fallbackStaffId: crm.user.staffId,
      inBook: true,
    });
    const customer = crm.customerName(job);
    return (
      <ShareFrame
        actions={
          <SharePdfButton
            onClick={() =>
              void downloadPhotoReportPdf({
                report: fromStore,
                job,
                photos,
                company: letterhead,
                contacts: crm.contacts,
                staff: crm.staff,
                customerName: customer,
              }).catch(() => toast.error("Could not build the PDF."))
            }
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          {fromStore.title.trim() || "Page"} · {fromStore.pages.length} page
          {fromStore.pages.length === 1 ? "" : "s"}
        </p>
        {fromStore.pages.map((page) => (
          <PhotoReportPagePreview
            key={page.id}
            page={page}
            job={job}
            photos={photos}
            report={fromStore}
            company={letterhead}
            contacts={crm.contacts}
            staff={crm.staff}
            customerName={customer}
          />
        ))}
      </ShareFrame>
    );
  }

  if (!remote || remoteState === "missing") {
    return <ShareMissing kind="page" />;
  }

  const company = companySettingsFromShared(remote.company);
  const contacts = contactsFromShared(remote);
  const staff = staffFromShared(remote);

  return (
    <ShareFrame
      actions={
        <SharePdfButton
          onClick={() =>
            void downloadPhotoReportPdf({
              report: remote.report,
              job: remote.job,
              photos: remote.photos,
              company,
              contacts,
              staff,
              customerName: remote.customer,
            }).catch(() => toast.error("Could not build the PDF."))
          }
        />
      }
    >
      <p className="text-sm text-muted-foreground">
        {remote.report.title.trim() || "Page"} · {remote.report.pages.length} page
        {remote.report.pages.length === 1 ? "" : "s"}
      </p>
      {remote.report.pages.map((page) => (
        <PhotoReportPagePreview
          key={page.id}
          page={page}
          job={remote.job}
          photos={remote.photos}
          report={remote.report}
          company={company}
          contacts={contacts}
          staff={staff}
          customerName={remote.customer}
        />
      ))}
    </ShareFrame>
  );
}
