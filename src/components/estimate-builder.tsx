"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, Copy, Download, Lock, Plus, Send } from "lucide-react";
import { CommitInput, CommitTextarea } from "@/components/commit-input";
import { CurrencyInput } from "@/components/currency-input";
import { DocumentTermsFields } from "@/components/document-terms-fields";
import { EstimateAddLine } from "@/components/estimate-add-line";
import { EstimateFilesPanel } from "@/components/estimate-files";
import { EstimateHomeowners } from "@/components/estimate-homeowners";
import { EstimateSectionCard } from "@/components/estimate-section-card";
import {
  EstimateStatusCard,
  EstimateSummaryCard,
  ReadyToSendCard,
  type ReadinessItem,
} from "@/components/estimate-summary-rail";
import { PriceBookSheet } from "@/components/estimate-writer";
import { PaperArchivedBanner } from "@/components/paper-archive-button";
import { ProposalDocument } from "@/components/proposal-document";
import { SettingsToggle } from "@/components/settings-chrome";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { CollectSignatureDialog } from "@/components/signature-pad";
import { EstimateStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cardHeaderLogo } from "@/lib/card";
import { useCrm } from "@/lib/crm-store";
import {
  companyEstimateTermsFor,
  contractTypeById,
  contractTypesFromCompany,
  defaultContractType,
} from "@/lib/contract-types";
import { documentProjectManager, letterheadCompanyForRecord, shareEmailOwnerFromBook } from "@/lib/document-owner";
import { downloadEstimatePdf, downloadSignatureCertificatePdf } from "@/lib/document-pdf";
import {
  estimateFollowsCompanyTerms,
  estimateTermsValues,
  liveEstimateTerms,
  setAmountToken,
} from "@/lib/document-terms";
import { photosForEstimateLine } from "@/lib/estimate-line-photos";
import {
  groupHasMixedPackages,
  isGbbEstimate,
  listEstimateOptions,
  nextOptionKey,
  nextOptionName,
  optionKeyForGroup,
  resolveSelectedPackage,
  scopedEstimateLines,
  type EstimateOption,
} from "@/lib/estimate-packages";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { mintEstimateSignerTokens } from "@/lib/estimate-signers";
import {
  estimateTotals,
  groupEstimateLines,
  linesForEstimate,
  type AdjustmentKind,
} from "@/lib/estimate-totals";
import { formatDate, formatMoney, localYmdPlusDays } from "@/lib/format";
import { jobPaperHref } from "@/lib/job-record";
import { formatJobSite } from "@/lib/leads";
import {
  billingEstimate,
  defaultTaxRateForMarket,
  isResidentialMarket,
  projectTypeForMarket,
  workMarket,
} from "@/lib/market";
import { moneyAmount } from "@/lib/money-input";
import { archiveStamp } from "@/lib/paper-archive";
import {
  coOwnerContact,
  customerContactDetails,
  jobHomeownersForEstimate,
  shareContactsForEstimate,
} from "@/lib/parties";
import {
  blankPaymentRows,
  paymentScheduleFromTerms,
  suggestedPaymentAmounts,
} from "@/lib/payment-schedule";
import { shareUrl } from "@/lib/share";
import {
  JOB_MARKETS,
  JOB_MARKET_LABELS,
  PROJECT_TYPE_LABELS,
  type Estimate,
  type EstimateLine,
  type JobMarket,
} from "@/lib/types";
import {
  canCreateEstimates,
  canGenerateSignatureCertificate,
  canManageSettings,
} from "@/lib/visibility";
import { cn } from "@/lib/utils";

const CARD = "rounded-[12px] border bg-card";
const HINT = "mt-1.5 text-xs text-muted-foreground";

function optionLetter(index: number) {
  return String.fromCharCode(65 + (index % 26));
}

function daysFromToday(ymd: string | null | undefined) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function describeSaved(savedAt: number, now: number) {
  const seconds = (now - savedAt) / 1000;
  if (seconds < 60) return "Saved just now";
  return `Saved ${Math.floor(seconds / 60)} min ago`;
}

/** "Saved just now" after the first change in this session; the store writes optimistically. */
function useSavedLabel(signature: string) {
  const previous = useRef(signature);
  const savedAt = useRef<number | null>(null);
  const [label, setLabel] = useState("All changes saved");
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    const stamp = Date.now();
    savedAt.current = stamp;
    const id = window.setTimeout(() => setLabel(describeSaved(stamp, Date.now())), 0);
    return () => window.clearTimeout(id);
  }, [signature]);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (savedAt.current != null) setLabel(describeSaved(savedAt.current, Date.now()));
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

export function EstimateBuilder({ estimate }: { estimate: Estimate }) {
  const router = useRouter();
  const crm = useCrm();
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [bookOpen, setBookOpen] = useState(false);
  const [bookGroup, setBookGroup] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSigning, setShareSigning] = useState<{
    shareToken: string;
    secondShareToken: string;
    secondContactId: string | null;
  } | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [emptySections, setEmptySections] = useState<string[]>([]);
  const [emptyOptions, setEmptyOptions] = useState<EstimateOption[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const lines = linesForEstimate(crm.estimateLines, estimate.id);
  const previewLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        photos: photosForEstimateLine(line, crm.photos),
      })),
    [crm.photos, lines],
  );
  const groups = groupEstimateLines(lines);
  const pendingSections = emptySections.filter((name) => !groups.some((group) => group.name === name));
  const displayGroups = [
    ...groups,
    ...pendingSections.map((name) => ({ name, lines: [] as EstimateLine[] })),
  ];
  const relatedInvoice = crm.invoices.find(
    (invoice) => invoice.estimateId === estimate.id && !invoice.archivedAt,
  );
  const seatRole = crm.effectiveStaff?.role ?? crm.viewer?.role;
  const canWriteEstimate = canCreateEstimates(seatRole);
  const editable = estimate.status === "draft" && canWriteEstimate;
  const optionalOpen =
    canWriteEstimate &&
    (estimate.status === "draft" || estimate.status === "sent" || estimate.status === "viewed");
  const canConvert =
    canWriteEstimate &&
    (estimate.status === "sent" || estimate.status === "viewed" || estimate.status === "accepted") &&
    !relatedInvoice;
  const contact = estimate.contactId ? crm.getContact(estimate.contactId) : undefined;
  const secondContact = estimate.secondContactId ? crm.getContact(estimate.secondContactId) : undefined;
  const opportunity = estimate.opportunityId ? crm.getOpportunity(estimate.opportunityId) : undefined;
  const job = estimate.jobId ? crm.getJob(estimate.jobId) : undefined;
  const inferredCoOwner =
    estimate.status === "accepted" || estimate.status === "declined"
      ? null
      : coOwnerContact(job, crm.contacts, estimate.contactId);
  const secondSignerName = secondContact?.name || inferredCoOwner?.name || null;
  const jobPhotos = useMemo(
    () =>
      estimate.jobId
        ? crm.photos.filter((photo) => photo.jobId === estimate.jobId && !photo.deletedAt)
        : [],
    [crm.photos, estimate.jobId],
  );
  const galleryHint = estimate.jobId
    ? jobPhotos.length === 0
      ? "This job does not have photos yet. Add them on the job record, then attach them here."
      : undefined
    : "Attach this proposal to a job to use that job’s photo gallery.";
  const jobRelatedKey = job
    ? `${job.primaryContactId}:${(job.relatedContactIds ?? []).join(",")}:${job.street}:${job.city}:${job.state}:${job.postalCode}:${job.location}`
    : "";
  useEffect(() => {
    if (!job) return;
    if (estimate.status === "accepted" || estimate.status === "declined") return;
    const fromJob = jobHomeownersForEstimate(job, crm.contacts);
    const site = {
      street: job.street.trim(),
      city: job.city.trim(),
      state: job.state.trim(),
      postalCode: job.postalCode.trim(),
    };
    const contactMatches = (estimate.contactId || null) === fromJob.contactId;
    const secondMatches = (estimate.secondContactId || null) === fromJob.secondContactId;
    const siteMatches =
      estimate.street === site.street &&
      estimate.city === site.city &&
      estimate.state === site.state &&
      estimate.postalCode === site.postalCode;
    if (contactMatches && secondMatches && siteMatches) return;
    const nextContact = fromJob.contactId
      ? crm.contacts.find((item) => item.id === fromJob.contactId)
      : undefined;
    const siteLabel = formatJobSite(site) || job.name;
    const patch: {
      contactId: string | null;
      clientId?: string | null;
      secondContactId: string | null;
      secondAcceptedAt?: string | null;
      shareToken?: string;
      secondShareToken?: string;
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      name?: string;
    } = {
      contactId: fromJob.contactId,
      secondContactId: fromJob.secondContactId,
      street: site.street,
      city: site.city,
      state: site.state,
      postalCode: site.postalCode,
    };
    if (siteLabel) patch.name = siteLabel;
    if (nextContact?.clientId) patch.clientId = nextContact.clientId;
    if (!secondMatches) {
      patch.secondAcceptedAt = null;
      const tokens = mintEstimateSignerTokens({
        shareToken: estimate.shareToken,
        secondShareToken: estimate.secondShareToken,
        secondContactId: fromJob.secondContactId,
      });
      patch.shareToken = tokens.shareToken;
      patch.secondShareToken = tokens.secondShareToken;
    }
    void crm.updateEstimate(estimate.id, patch);
  }, [
    crm.contacts,
    crm.updateEstimate,
    estimate,
    estimate.contactId,
    estimate.id,
    estimate.secondContactId,
    estimate.status,
    estimate.street,
    estimate.city,
    estimate.state,
    estimate.postalCode,
    job,
    jobRelatedKey,
  ]);

  const customer = crm.customerName(estimate);
  const clientContact = customerContactDetails(estimate, crm);
  const site =
    formatJobSite({
      street: estimate.street,
      city: estimate.city,
      state: estimate.state,
      postalCode: estimate.postalCode,
    }) ||
    job?.location?.trim() ||
    "";
  const title = site || estimate.name;
  const descriptor =
    estimate.name.trim() && estimate.name.trim() !== title.trim()
      ? estimate.name.trim()
      : job?.projectType
        ? PROJECT_TYPE_LABELS[job.projectType]
        : "";
  const market = workMarket(job, opportunity);
  const residential = isResidentialMarket(market);
  const billed = billingEstimate(estimate, market);
  const totals = estimateTotals(billed, lines);
  const lineOnlyTotals = estimateTotals(billed, lines, { ignoreSubtotalOverride: true });
  const scopedLines = scopedEstimateLines(estimate, lines);
  const gbb = isGbbEstimate(estimate);
  const estimateOptions = listEstimateOptions(lines, emptyOptions);
  const selectedPackage = resolveSelectedPackage(estimate, lines, emptyOptions);
  const selectedOptionIndex = estimateOptions.findIndex((option) => option.key === selectedPackage);
  const selectedOption = selectedOptionIndex >= 0 ? estimateOptions[selectedOptionIndex] : undefined;
  const letterhead = letterheadCompanyForRecord({
    company: crm.company,
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    inBook: true,
  });
  const projectManager = documentProjectManager({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    companyPhone: letterhead.phone,
  });
  const emailOwner = shareEmailOwnerFromBook({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    senderStaff: crm.effectiveStaff ?? crm.viewer,
    companyPhone: letterhead.phone,
    companyEmail: crm.company.email,
    companySignature: crm.company.defaultEmailSignature,
  });
  const contractTypes = contractTypesFromCompany(crm.company);
  const contract =
    contractTypeById(contractTypes, estimate.contractTypeId) ?? defaultContractType(contractTypes);
  const terms = liveEstimateTerms({
    estimate,
    companyDefault: companyEstimateTermsFor(letterhead, estimate.contractTypeId),
  });
  const schedule = paymentScheduleFromTerms(terms);
  const blankPayments = blankPaymentRows(schedule);
  const suggestedPayments = suggestedPaymentAmounts(schedule, totals);
  const savedLabel = useSavedLabel(JSON.stringify([estimate, lines]));
  const validDays = daysFromToday(estimate.validUntil);
  const canEditPayments = editable && estimateFollowsCompanyTerms(estimate);
  const unpricedIncluded = scopedLines.filter(
    (line) => (!line.optional || line.selected) && line.unitCost <= 0,
  ).length;

  function packageForGroup(name?: string) {
    if (!name) return "";
    return optionKeyForGroup(name, lines, emptyOptions);
  }

  function addOptionSection() {
    const name = nextOptionName(displayGroups.map((group) => group.name));
    const key = nextOptionKey([...lines.map((line) => line.package), ...emptyOptions.map((item) => item.key)]);
    setEmptySections((prev) => [...prev, name]);
    setEmptyOptions((prev) => [...prev, { key, name }]);
    setAddingSection(false);
    void crm.updateEstimate(estimate.id, {
      packageMode: "gbb",
      selectedPackage: gbb ? estimate.selectedPackage || key : key,
    });
  }

  async function buildOptionFrom(group: { name: string; lines: EstimateLine[] }) {
    const name = nextOptionName(displayGroups.map((item) => item.name));
    const key = nextOptionKey([...lines.map((line) => line.package), ...emptyOptions.map((item) => item.key)]);
    if (!gbb || !estimate.selectedPackage) {
      await crm.updateEstimate(estimate.id, { packageMode: "gbb", selectedPackage: key });
    }
    if (group.lines.length === 0) {
      setEmptySections((prev) => [...prev, name]);
      setEmptyOptions((prev) => [...prev, { key, name }]);
      toast.success(`Started ${name} from ${group.name}.`);
      return;
    }
    for (const line of group.lines) {
      await crm.addCustomEstimateLine(estimate.id, name, {
        package: key,
        title: line.title,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        optional: line.optional,
        selected: line.selected,
        taxable: line.taxable,
        catalogItemId: line.catalogItemId,
      });
    }
    toast.success(`Started ${name} from ${group.name}.`);
  }

  function renameSection(group: { name: string; lines: EstimateLine[] }, next: string) {
    if (next === group.name) return;
    for (const line of group.lines) {
      void crm.updateEstimateLine(line.id, { groupName: next });
    }
    setEmptySections((prev) =>
      prev
        .map((name) => (name === group.name ? next : name))
        .filter((name, index, all) => all.indexOf(name) === index),
    );
    setEmptyOptions((prev) => prev.map((item) => (item.name === group.name ? { ...item, name: next } : item)));
  }

  function removeSection(group: { name: string; lines: EstimateLine[] }) {
    for (const line of group.lines) void crm.removeEstimateLine(line.id);
    setEmptySections((prev) => prev.filter((name) => name !== group.name));
    setEmptyOptions((prev) => prev.filter((item) => item.name !== group.name));
  }

  function submitSection() {
    const name = sectionName.trim() || "New section";
    if (!displayGroups.some((group) => group.name === name)) {
      setEmptySections((prev) => [...prev, name]);
    }
    setSectionName("");
    setAddingSection(false);
  }

  function setMarket(next: JobMarket) {
    if (next === market) return;
    if (opportunity) {
      void crm.updateOpportunity(opportunity.id, { market: next, projectType: projectTypeForMarket(next) });
    }
    if (job) {
      void crm.updateJob(job.id, { market: next, projectType: projectTypeForMarket(next) });
    }
    void crm.updateEstimate(estimate.id, { taxRate: defaultTaxRateForMarket(next) });
  }

  function commitPayment(key: string, amount: number | null) {
    const next = setAmountToken(terms, key, amount);
    if (next === terms) return;
    void crm.updateEstimate(estimate.id, { terms: next });
  }

  async function handleConvert() {
    setPending(true);
    try {
      const invoice = await crm.convertEstimateToInvoice(estimate.id);
      toast.success(`${invoice.number} created from this proposal.`);
      router.push(`/invoices/${invoice.id}`);
    } catch {
      setPending(false);
    }
  }

  function downloadPdf() {
    if (lines.length === 0) {
      toast.error("Add at least one line before generating a PDF.");
      return;
    }
    return downloadEstimatePdf({
      estimate: billed,
      lines,
      company: letterhead,
      customer,
      customerPhone: clientContact.phone,
      customerEmail: clientContact.email,
      secondCustomerPhone: clientContact.secondPhone,
      secondCustomerEmail: clientContact.secondEmail,
      projectManager,
      primaryCustomer: contact?.name,
      secondCustomer: secondSignerName,
      photos: crm.photos,
      jobCode: job?.code,
      files: (crm.estimateFiles ?? []).filter((file) => file.estimateId === estimate.id),
    });
  }

  function downloadSignatureCertificate() {
    const events = (crm.estimateSignatureEvents ?? []).filter((event) => event.estimateId === estimate.id);
    if (!events.length) {
      toast.message("No signature record yet. Send the link or collect a signature first.");
      return;
    }
    return downloadSignatureCertificatePdf({
      estimate: billed,
      company: letterhead,
      customer,
      customerPhone: clientContact.phone,
      customerEmail: clientContact.email,
      events,
    }).catch(() => toast.error("Could not build the signature certificate."));
  }

  const shareEstimate = useMemo(
    () =>
      shareSigning
        ? {
            ...estimate,
            shareToken: shareSigning.shareToken,
            secondShareToken: shareSigning.secondShareToken,
            secondContactId: shareSigning.secondContactId ?? estimate.secondContactId,
          }
        : estimate,
    [estimate, shareSigning],
  );

  async function openShare(markSent: boolean) {
    if (markSent && totals.includedCount === 0) {
      toast.error("Add at least one included line before sending.");
      return;
    }
    setPending(true);
    try {
      if (markSent) await crm.sendEstimate(estimate.id);
      const tokens = await crm.ensureEstimateShareToken(estimate.id);
      setShareSigning(tokens);
      setShareOpen(true);
      if (markSent) setTab("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare the share links.");
    } finally {
      setPending(false);
    }
  }

  async function handleReopen() {
    setPending(true);
    try {
      await crm.reopenEstimate(estimate.id);
      toast.success("Proposal reopened as a draft. Edit it and send again.");
      setTab("write");
    } catch {
      // Store already toasted the reason.
    } finally {
      setPending(false);
    }
  }

  const primaryAction =
    estimate.status === "draft" ? (
      <Button size="lg" disabled={pending || totals.includedCount === 0} onClick={() => void openShare(true)}>
        <Send data-icon="inline-start" />
        Send for signature
      </Button>
    ) : estimate.status === "declined" && !relatedInvoice ? (
      <Button size="lg" disabled={pending} onClick={() => void handleReopen()}>
        Edit and send again
      </Button>
    ) : canConvert ? (
      <Button size="lg" disabled={pending} onClick={() => void handleConvert()}>
        Convert to invoice
      </Button>
    ) : relatedInvoice ? (
      <Button size="lg" variant="secondary" onClick={() => router.push(`/invoices/${relatedInvoice.id}`)}>
        Open {relatedInvoice.number}
      </Button>
    ) : (
      <Button size="lg" variant="secondary" disabled={pending} onClick={() => void openShare(false)}>
        Share link
      </Button>
    );

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        More
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={pending || lines.length === 0} onClick={() => void downloadPdf()}>
          <Download />
          Download PDF
        </DropdownMenuItem>
        {estimate.status === "draft" ||
        estimate.status === "sent" ||
        estimate.status === "viewed" ||
        (estimate.status === "accepted" && !hasEstimateSignature(estimate)) ? (
          <DropdownMenuItem disabled={pending || totals.includedCount === 0} onClick={() => setSignOpen(true)}>
            {estimate.status === "accepted" ? "Add signature" : "Collect signature in person"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={pending} onClick={() => void openShare(false)}>
          Share link
        </DropdownMenuItem>
        {estimate.status === "sent" || estimate.status === "viewed" ? (
          <DropdownMenuItem
            onClick={() => {
              void crm.declineEstimate(estimate.id);
              toast.message("Marked declined.");
            }}
          >
            Mark declined
          </DropdownMenuItem>
        ) : null}
        {estimate.status === "declined" && !relatedInvoice ? (
          <DropdownMenuItem disabled={pending} onClick={() => void handleReopen()}>
            Edit and send again
          </DropdownMenuItem>
        ) : null}
        {canConvert ? (
          <DropdownMenuItem disabled={pending} onClick={() => void handleConvert()}>
            Convert to invoice
          </DropdownMenuItem>
        ) : null}
        {relatedInvoice ? (
          <DropdownMenuItem onClick={() => router.push(`/invoices/${relatedInvoice.id}`)}>
            Open {relatedInvoice.number}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {opportunity ? (
          <DropdownMenuItem onClick={() => router.push(`/opportunities/${opportunity.id}`)}>
            Open lead · {opportunity.name}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() => {
            void crm.duplicateEstimate(estimate.id).then((copy) => {
              toast.success(`${copy.number} drafted as a copy.`);
              router.push(`/estimates/${copy.id}`);
            });
          }}
        >
          <Copy />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setTemplateName(estimate.name.replace(/\s+—\s+.+$/, "").trim() || estimate.name);
            setSaveTemplateOpen(true);
          }}
        >
          Save as template
        </DropdownMenuItem>
        {canGenerateSignatureCertificate(crm.viewer) ? (
          <DropdownMenuItem disabled={pending} onClick={() => void downloadSignatureCertificate()}>
            Generate signature certificate
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onClick={() => {
            if (estimate.archivedAt) {
              void crm.updateEstimate(estimate.id, { archivedAt: null });
              toast.success(`${estimate.number} is back on the job.`);
              return;
            }
            if (
              !window.confirm(
                `Archive ${estimate.number}? It leaves this job’s Paper list. You can restore it later.`,
              )
            ) {
              return;
            }
            void crm.updateEstimate(estimate.id, { archivedAt: archiveStamp() });
            toast.success(`${estimate.number} is archived.`);
          }}
        >
          {estimate.archivedAt ? "Restore" : "Archive"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const summaryRows: Array<{ label: string; value: string; muted?: boolean }> = [
    {
      label: totals.subtotalOverridden
        ? "Lump-sum price"
        : totals.marginAmount > 0
          ? "Line items + margin"
          : "Line items",
      value: formatMoney(totals.subtotal),
    },
  ];
  if (totals.discount > 0) summaryRows.push({ label: "Discount", value: `−${formatMoney(totals.discount)}` });
  summaryRows.push(
    residential
      ? { label: "Tax", value: "Not taxed", muted: true }
      : { label: `Tax (${billed.taxRate}%)`, value: formatMoney(totals.tax) },
  );
  if (totals.optionalTotal > 0) {
    summaryRows.push({ label: "Optional, not included", value: formatMoney(totals.optionalTotal), muted: true });
  }
  const hasOptional = scopedLines.some((line) => line.optional);
  const summaryFootnote =
    estimate.status === "accepted"
      ? `Signed ${formatDate(estimate.acceptedAt)}.`
      : estimate.status === "declined"
        ? "Declined by the homeowner."
        : gbb && estimateOptions.length > 1
          ? hasOptional
            ? "Homeowner picks an option and add-ons when signing."
            : "Homeowner picks an option when signing."
          : hasOptional
            ? "Homeowner picks add-ons when signing."
            : null;

  const summaryCard = (className?: string) => (
    <EstimateSummaryCard
      className={className}
      eyebrow={
        gbb && selectedOption
          ? `Option ${optionLetter(selectedOptionIndex)} · ${selectedOption.name}`
          : "Proposal total"
      }
      countLabel={`${totals.includedCount} line${totals.includedCount === 1 ? "" : "s"} included`}
      total={formatMoney(totals.total)}
      dueLine={totals.deposit > 0 ? `${formatMoney(totals.deposit)} due at signing` : null}
      rows={summaryRows}
      action={primaryAction}
      footnote={summaryFootnote}
    />
  );

  const readiness: ReadinessItem[] = [
    contact?.email?.trim()
      ? { label: "Homeowner email on file", state: "ok" }
      : contact?.phone?.trim()
        ? { label: "Homeowner phone on file", state: "ok", note: "— no email, text the link" }
        : {
            label: "Homeowner contact",
            state: "warn",
            note: job ? "— add on the job" : "— attach a job",
            href: job ? jobPaperHref(job.id) : undefined,
          },
    totals.includedCount === 0
      ? { label: "Line items priced", state: "todo", note: "— add items" }
      : unpricedIncluded > 0
        ? { label: "Line items priced", state: "warn", note: `— ${unpricedIncluded} at $0.00` }
        : { label: "Line items priced", state: "ok" },
    { label: "Contract selected", state: "ok", note: `· ${contract.name}` },
    schedule.length === 0
      ? { label: "Payment schedule", state: "todo", note: "— no payment lines on this contract", href: "#payment-schedule" }
      : blankPayments.length === 0
        ? { label: "Payment schedule filled", state: "ok" }
        : {
            label:
              blankPayments.length === 1
                ? `${blankPayments[0]!.label} amount`
                : `${blankPayments.length} payment amounts`,
            state: "warn",
            note: "— blank",
            href: "#payment-schedule",
          },
  ];

  const statusDetail =
    estimate.status === "sent"
      ? `Sent ${formatDate(estimate.sentAt)}. Waiting on the homeowner.`
      : estimate.status === "viewed"
        ? "The homeowner opened the proposal. Prices are locked; add-ons stay open."
        : estimate.status === "accepted"
          ? `Signed ${formatDate(estimate.acceptedAt)}. ${relatedInvoice ? `Billed on ${relatedInvoice.number}.` : "Convert it to an invoice when you are ready to bill."}`
          : estimate.status === "declined"
            ? relatedInvoice
              ? "Declined and already invoiced, so it stays locked."
              : "Declined and locked. Reopen it to edit lines and send again."
            : null;

  const crumb = job
    ? { href: jobPaperHref(job.id), label: `Job · ${job.name}` }
    : opportunity
      ? { href: `/opportunities/${opportunity.id}`, label: `Lead · ${opportunity.name}` }
      : { href: "/estimates", label: "Estimates" };

  const lineEditor = (
    <div className="space-y-4">
      {gbb && estimateOptions.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {estimateOptions.map((option, index) => {
            const amount = estimateTotals(
              { ...billed, packageMode: "gbb", selectedPackage: option.key },
              lines,
            ).total;
            const active = option.key === selectedPackage;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                disabled={!optionalOpen}
                onClick={() => void crm.updateEstimate(estimate.id, { selectedPackage: option.key })}
                className={cn(
                  CARD,
                  "p-4 text-left transition-colors disabled:cursor-default",
                  active ? "border-primary ring-1 ring-primary" : optionalOpen && "hover:border-foreground/30",
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Option {optionLetter(index)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                      active ? "border-primary" : "border-muted-foreground/40",
                    )}
                  >
                    {active ? <span className="size-2 rounded-full bg-primary" /> : null}
                  </span>
                </span>
                <span className="mt-1 block truncate text-sm font-semibold">{option.name}</span>
                <span className="mt-1 block text-lg font-semibold tabular-nums">{formatMoney(amount)}</span>
              </button>
            );
          })}
          {editable ? (
            <button
              type="button"
              onClick={addOptionSection}
              className="flex min-h-[5.5rem] items-center justify-center gap-2 rounded-[12px] border border-dashed bg-card/60 px-4 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="size-4" />
              Add option
            </button>
          ) : null}
        </div>
      ) : null}

      {displayGroups.length === 0 ? (
        <div className={cn(CARD, "px-5 py-8")}>
          <p className="font-medium">No lines yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Search the price book or type a custom item. Optional work stays out of the total until the homeowner
            includes it.
          </p>
          {editable ? (
            <div className="mt-4 max-w-lg">
              <EstimateAddLine
                placeholder="Add from price book or type a custom item"
                onPickCatalog={async (id) => {
                  const added = await crm.addEstimateLinesFromCatalog(estimate.id, [id]);
                  if (added[0]) toast.success(`Added ${added[0].title}.`);
                }}
                onCustom={async (title) => {
                  await crm.addCustomEstimateLine(estimate.id, undefined, { title });
                }}
                onBrowse={() => {
                  setBookGroup(undefined);
                  setBookOpen(true);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        displayGroups.map((group) => {
          const optionKey = packageForGroup(group.name);
          return (
            <EstimateSectionCard
              key={group.name}
              name={group.name}
              lines={group.lines}
              editable={editable}
              optionalOpen={optionalOpen}
              showTax={!residential}
              showPackage={gbb && groupHasMixedPackages(group.lines)}
              isOption={Boolean(optionKey)}
              galleryPhotos={jobPhotos}
              galleryHint={galleryHint}
              onRename={(next) => renameSection(group, next)}
              onPatchLine={(id, patch) => void crm.updateEstimateLine(id, patch)}
              onMoveLine={(id, direction) => void crm.reorderEstimateLine(id, direction)}
              onRemoveLine={(id) => void crm.removeEstimateLine(id)}
              onPhotosChange={(id, photoIds) => void crm.updateEstimateLine(id, { photoIds })}
              onAddCatalog={async (id) => {
                const added = await crm.addEstimateLinesFromCatalog(estimate.id, [id], group.name, {
                  package: optionKey,
                });
                if (added[0]) toast.success(`Added ${added[0].title}.`);
              }}
              onAddCustom={async (lineTitle) => {
                await crm.addCustomEstimateLine(estimate.id, group.name, { package: optionKey, title: lineTitle });
              }}
              onBrowse={() => {
                setBookGroup(group.name);
                setBookOpen(true);
              }}
              onBuildOption={editable && optionKey ? () => void buildOptionFrom(group) : undefined}
              onRemoveSection={() => removeSection(group)}
            />
          );
        })
      )}

      {editable ? (
        addingSection ? (
          <form
            className="flex flex-wrap items-center gap-2 rounded-[12px] border border-dashed bg-card px-3 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitSection();
            }}
          >
            <Input
              autoFocus
              value={sectionName}
              onChange={(event) => setSectionName(event.target.value)}
              placeholder="Roof, Gutters, Siding, Allowances…"
              className="h-8 max-w-xs"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setAddingSection(false);
                  setSectionName("");
                }
              }}
            />
            <Button type="submit" size="sm">
              Add section
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddingSection(false);
                setSectionName("");
              }}
            >
              Cancel
            </Button>
            {!gbb ? (
              <Button type="button" size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={addOptionSection}>
                Add an option instead
              </Button>
            ) : null}
          </form>
        ) : (
          <div className="flex items-stretch rounded-[12px] border border-dashed bg-card">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded-l-[12px] px-4 py-3 text-sm transition-colors hover:bg-muted/40"
              onClick={() => setAddingSection(true)}
            >
              <Plus className="size-4" />
              <span className="font-medium">Add section</span>
              <span className="hidden text-muted-foreground sm:inline">· Roof, Gutters, Siding, Allowances…</span>
            </button>
            {!gbb ? (
              <button
                type="button"
                className="rounded-r-[12px] border-l border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                onClick={addOptionSection}
              >
                Add option
              </button>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );

  const proposalDetails = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
        <h2 className="font-heading text-xl font-medium">Proposal details</h2>
        <p className="text-xs text-muted-foreground">Everything below prints on the proposal unless marked internal</p>
      </div>

      <section className={cn(CARD, "p-4 sm:p-5")}>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <Label htmlFor="estimate-valid-until">Valid until</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <CommitInput
                id="estimate-valid-until"
                type="date"
                className="min-w-[10rem] flex-1"
                disabled={!editable}
                value={estimate.validUntil ?? ""}
                onCommit={(value) => void crm.updateEstimate(estimate.id, { validUntil: value || null })}
              />
              {editable ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void crm.updateEstimate(estimate.id, { validUntil: localYmdPlusDays(30) })}
                  >
                    30 days
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void crm.updateEstimate(estimate.id, { validUntil: localYmdPlusDays(60) })}
                  >
                    60
                  </Button>
                </>
              ) : null}
            </div>
            <p className={HINT}>
              {validDays == null
                ? "No expiry · prints as open-ended on the proposal"
                : validDays > 0
                  ? `${validDays} day${validDays === 1 ? "" : "s"} from today · prints on the proposal`
                  : validDays === 0
                    ? "Expires today · prints on the proposal"
                    : `Expired ${-validDays} day${validDays === -1 ? "" : "s"} ago`}
            </p>
          </div>
          <div>
            <Label>Property type</Label>
            <div className="mt-1.5 inline-flex rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Property type">
              {JOB_MARKETS.map((item) => {
                const active = market === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    disabled={!editable}
                    onClick={() => setMarket(item)}
                    className={cn(
                      "rounded-[5px] px-3 py-1 text-sm transition-colors disabled:cursor-default",
                      active ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {JOB_MARKET_LABELS[item]}
                  </button>
                );
              })}
            </div>
            <p className={HINT}>{residential ? "Residential work is not taxed" : "Commercial proposals include sales tax"}</p>
          </div>
        </div>
        <div className="mt-5">
          <Label htmlFor="estimate-cover-note">Cover note</Label>
          <CommitTextarea
            id="estimate-cover-note"
            rows={3}
            className="mt-1.5"
            disabled={!editable}
            value={estimate.intro}
            placeholder="John — thanks for walking the roof with me Tuesday. Two options below; both include full tear-off and new ventilation."
            onCommit={(value) => void crm.updateEstimate(estimate.id, { intro: value })}
          />
          <p className={HINT}>Opens the proposal, above the line items</p>
        </div>
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold">Pricing</h3>
          <p className="text-xs text-muted-foreground">Totals update in the summary as you type</p>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Discount</Label>
              <KindAmountField
                className="mt-1.5"
                kind={estimate.discountKind}
                value={estimate.discountValue}
                disabled={!editable}
                onChange={(discountKind, discountValue) =>
                  void crm.updateEstimate(estimate.id, { discountKind, discountValue })
                }
              />
              <p className={HINT}>
                {totals.discount > 0
                  ? `${formatMoney(totals.discount)} off · shows as its own line on the proposal`
                  : "Shows as its own line on the proposal"}
              </p>
            </div>
            <div>
              <Label htmlFor="estimate-tax-rate">Tax rate</Label>
              <SuffixField suffix="%" className="mt-1.5">
                <CommitInput
                  id="estimate-tax-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  className="pr-8"
                  disabled={!editable || residential}
                  value={residential ? 0 : estimate.taxRate}
                  onCommit={(value) => void crm.updateEstimate(estimate.id, { taxRate: Number(value) || 0 })}
                />
              </SuffixField>
              <p className={HINT}>
                {residential ? "Off for residential work" : "Applied to taxable lines, after the discount"}
              </p>
            </div>
            <div>
              <Label>Deposit at signing</Label>
              <KindAmountField
                className="mt-1.5"
                kind={estimate.depositKind}
                value={estimate.depositValue}
                disabled={!editable}
                onChange={(depositKind, depositValue) =>
                  void crm.updateEstimate(estimate.id, { depositKind, depositValue })
                }
              />
              <p className={HINT}>
                {totals.deposit > 0
                  ? `${formatMoney(totals.deposit)} due at signing · suggested for Payment 1`
                  : "Nothing due at signing"}
              </p>
            </div>
          </div>

          <div className="rounded-[10px] border bg-muted/30 p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              <Lock className="size-3" aria-hidden />
              Internal · never shown to the homeowner
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="estimate-margin">Margin</Label>
                <SuffixField suffix="%" className="mt-1.5">
                  <CommitInput
                    id="estimate-margin"
                    type="number"
                    min={0}
                    step="0.01"
                    className="pr-8"
                    disabled={!editable || totals.subtotalOverridden}
                    value={estimate.marginPercent}
                    onCommit={(value) => {
                      const marginPercent = Math.max(0, Number(value) || 0);
                      void crm.updateEstimate(estimate.id, { marginPercent });
                    }}
                  />
                </SuffixField>
                <p className={HINT}>
                  {totals.subtotalOverridden
                    ? "Off while a lump-sum price is set"
                    : totals.marginAmount > 0
                      ? `Adds ${formatMoney(totals.marginAmount)} on ${formatMoney(totals.lineSubtotal)} in line items. Line prices on the proposal include it.`
                      : "Marks up included lines after you finish items. Line prices on the proposal include it."}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="estimate-lump-sum">Lump-sum price</Label>
                  <SettingsToggle
                    checked={totals.subtotalOverridden}
                    disabled={!editable}
                    label="Set a lump-sum price"
                    onCheckedChange={(next) =>
                      void crm.updateEstimate(estimate.id, {
                        subtotalOverride: next ? lineOnlyTotals.subtotal : null,
                      })
                    }
                  />
                </div>
                <CurrencyInput
                  id="estimate-lump-sum"
                  className="mt-1.5"
                  disabled={!editable || !totals.subtotalOverridden}
                  value={estimate.subtotalOverride ?? ""}
                  placeholder={formatMoney(lineOnlyTotals.subtotal)}
                  onCommit={(text) => {
                    const amount = Math.max(0, moneyAmount(text) ?? 0);
                    if (Math.round(amount * 100) !== Math.round((estimate.subtotalOverride ?? -1) * 100)) {
                      void crm.updateEstimate(estimate.id, { subtotalOverride: amount });
                    }
                  }}
                />
                <p className={HINT}>
                  {totals.subtotalOverridden
                    ? `On · line items still total ${formatMoney(totals.lineSubtotal)} for bidding`
                    : "Off · subtotal follows the included line items"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Hide line prices on the proposal</p>
              <p className="text-xs text-muted-foreground">
                Homeowner still sees the itemized scope and totals, but not unit prices or line amounts.
              </p>
            </div>
            <SettingsToggle
              checked={estimate.hideLinePrices}
              disabled={!editable}
              label="Hide line prices on the proposal"
              onCheckedChange={(next) => void crm.updateEstimate(estimate.id, { hideLinePrices: next })}
            />
          </div>
        </div>
      </section>

      <section className={CARD}>
        <div className="border-b px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold">Contract &amp; payments</h3>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div>
            <Label htmlFor="estimate-contract-type">Company contract</Label>
            <div className="mt-1.5 flex gap-2">
              <Select
                value={contract.id}
                disabled={!estimateFollowsCompanyTerms(estimate) || estimate.status === "declined"}
                items={contractTypes.map((item) => ({ value: item.id, label: item.name }))}
                onValueChange={(value) => {
                  if (!value) return;
                  void crm.updateEstimate(estimate.id, { contractTypeId: String(value) });
                }}
              >
                <SelectTrigger id="estimate-contract-type" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contractTypes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      {item.isDefault ? " · Default" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => setTermsOpen(true)}>
                View terms
              </Button>
            </div>
            <p className={HINT}>
              {estimateFollowsCompanyTerms(estimate)
                ? "Locked language comes from this contract. Payment amounts below stay with this proposal."
                : "Signed proposals keep the contract they were signed with."}
            </p>
          </div>

          <div id="payment-schedule" className="scroll-mt-24">
            <p className="text-sm font-medium">Payment schedule</p>
            {schedule.length === 0 ? (
              <p className={HINT}>
                This contract has no payment lines.{" "}
                {crm.viewer && canManageSettings(crm.viewer.role, crm.viewer) ? (
                  <Link href="/settings/documents" className="underline underline-offset-2 hover:text-foreground">
                    Add “Payment 1: $____” lines in Settings
                  </Link>
                ) : (
                  "A company admin can add Payment lines to the contract in Settings."
                )}
              </p>
            ) : (
              <ol className="mt-1.5 divide-y rounded-md border">
                {schedule.map((row) => {
                  const suggestion = suggestedPayments[row.key];
                  const filled = row.amount != null;
                  return (
                    <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                          filled ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {row.index}
                      </span>
                      <p className="min-w-0 flex-1 text-sm">
                        {row.label}
                        {row.detail ? <span className="text-muted-foreground"> · {row.detail}</span> : null}
                      </p>
                      {canEditPayments ? (
                        <span className="flex items-center gap-1.5">
                          {!filled && suggestion != null ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => commitPayment(row.key, suggestion)}
                            >
                              Use {formatMoney(suggestion)}
                            </Button>
                          ) : null}
                          <CurrencyInput
                            aria-label={`${row.label} amount`}
                            className="h-8 w-32 text-right"
                            placeholder="$ amount"
                            value={row.amount ?? ""}
                            onCommit={(text) => {
                              const amount = text.trim() ? moneyAmount(text) : null;
                              if ((amount ?? null) !== row.amount) commitPayment(row.key, amount);
                            }}
                          />
                        </span>
                      ) : (
                        <p className={cn("text-sm tabular-nums", filled ? "font-semibold" : "text-muted-foreground")}>
                          {filled ? formatMoney(row.amount!) : "Blank"}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {schedule.length > 0 ? (
              <p className={HINT}>
                Blank payments print as a blank line on the proposal. Type each amount — the homeowner sees exactly what
                you enter.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={cn(CARD, "p-4 sm:p-5")}>
          <h3 className="text-sm font-semibold">Notes</h3>
          <CommitTextarea
            rows={5}
            className="mt-2.5"
            value={estimate.notes}
            disabled={estimate.status === "declined"}
            placeholder="Allowance details, exclusions, or anything that belongs after the total"
            onCommit={(value) => void crm.updateEstimate(estimate.id, { notes: value })}
          />
          <p className={HINT}>Prints after the total on the proposal, client link and PDF</p>
        </section>
        <section className={cn(CARD, "p-4 sm:p-5")}>
          <h3 className="text-sm font-semibold">Attachments</h3>
          <div className="mt-2.5">
            <EstimateFilesPanel estimateId={estimate.id} disabled={estimate.status === "declined"} />
          </div>
        </section>
      </div>
    </div>
  );

  const preview = (
    <ProposalDocument
      company={crm.company}
      estimate={estimate}
      lines={previewLines}
      photos={crm.photos}
      customer={customer}
      market={market}
      selectable={optionalOpen}
      primaryCustomer={contact?.name}
      secondCustomer={secondSignerName}
      onToggleOptional={(line, selected) => void crm.updateEstimateLine(line.id, { selected })}
      onSelectPackage={
        optionalOpen ? (pkg) => void crm.updateEstimate(estimate.id, { selectedPackage: pkg }) : undefined
      }
      files={(crm.estimateFiles ?? [])
        .filter((file) => file.estimateId === estimate.id)
        .map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          url: file.url,
          createdAt: file.createdAt,
        }))}
      onTermsChange={editable ? (next) => void crm.updateEstimate(estimate.id, { terms: next }) : undefined}
    />
  );

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link
          href={crumb.href}
          className="-ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          {crumb.label}
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium tracking-wide text-muted-foreground">{estimate.number}</span>
              <EstimateStatusBadge status={estimate.status} />
              <span className="text-muted-foreground">{savedLabel}</span>
            </div>
            {editable && !site ? (
              <CommitInput
                aria-label="Proposal name"
                className="font-heading mt-1 h-auto border-0 bg-transparent px-0 text-[1.85rem] leading-[1.1] font-medium shadow-none focus-visible:ring-0"
                value={estimate.name}
                onCommit={(value) => {
                  if (value.trim()) void crm.updateEstimate(estimate.id, { name: value.trim() });
                }}
              />
            ) : (
              <h1 className="font-heading mt-1 text-[1.85rem] leading-[1.1] font-medium text-balance">{title}</h1>
            )}
            <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground [&>span+span]:before:mr-2 [&>span+span]:before:content-['·']">
              <span>{customer}</span>
              {descriptor ? <span>{descriptor}</span> : null}
              <span>Valid until {formatDate(estimate.validUntil)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border bg-muted/40 p-0.5" role="tablist" aria-label="Writer view">
              {(
                [
                  ["write", "Write"],
                  ["preview", "Customer preview"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "rounded-[5px] px-3 py-1 text-sm transition-colors",
                    tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {moreMenu}
          </div>
        </div>
        {estimate.archivedAt ? <PaperArchivedBanner label={estimate.number} /> : null}
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-5">
        <div className="min-w-0 space-y-6">
          {summaryCard("lg:hidden")}
          {tab === "write" ? (
            <>
              {lineEditor}
              {proposalDetails}
            </>
          ) : (
            preview
          )}
        </div>
        <aside className="mt-6 space-y-3 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          {summaryCard("hidden lg:block")}
          {estimate.status === "draft" ? <ReadyToSendCard title="Ready to send" items={readiness} /> : null}
          <EstimateHomeowners job={job} primaryId={estimate.contactId} disabled={!editable} />
          <EstimateStatusCard status={estimate.status} detail={statusDetail} />
        </aside>
      </div>

      <PriceBookSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        onPick={async (catalogItemIds) => {
          const added = await crm.addEstimateLinesFromCatalog(estimate.id, catalogItemIds, bookGroup, {
            package: packageForGroup(bookGroup),
          });
          if (added.length === 1) toast.success(`Added ${added[0].title}.`);
          else if (added.length > 1) toast.success(`Added ${added.length} items.`);
        }}
      />
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={`Share ${estimate.number}`}
        description="Email or text each homeowner, or copy their link. They review the proposal and sign from their phone — no login. Each signer needs their own link; the other person’s link will not let them sign."
        url={shareEstimate.shareToken ? shareUrl("e", shareEstimate.shareToken) : ""}
        kind="estimate"
        documentNumber={estimate.number}
        documentName={estimate.name}
        propertyAddress={site}
        companyName={crm.company.name}
        companyLogoUrl={cardHeaderLogo(crm.company)}
        companyWebsite={crm.company.website}
        companyPhone={letterhead.phone || crm.company.phone}
        companyStreet={crm.company.street}
        companyCity={crm.company.city}
        companyState={crm.company.state}
        companyPostalCode={crm.company.postalCode}
        emailTemplates={crm.company.emailTemplates}
        jobStreet={estimate.street}
        jobCity={estimate.city}
        jobState={estimate.state}
        jobPostalCode={estimate.postalCode}
        validUntil={estimate.validUntil}
        sender={emailOwner}
        recipients={shareContactsForEstimate(shareEstimate, crm)}
        onDownloadPdf={downloadPdf}
        onTexted={(sent) =>
          crm.logOutboundText({
            ...sent,
            jobId: estimate.jobId,
            opportunityId: estimate.opportunityId,
            contactId: sent.contactId || estimate.contactId,
          })
        }
        onEmailed={(sent) =>
          crm.logOutboundEmail({
            ...sent,
            jobId: estimate.jobId,
            opportunityId: estimate.opportunityId,
            contactId: sent.contactId || estimate.contactId,
          })
        }
      />
      <CollectSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        defaultName={customer === "—" ? "" : customer}
        estimateNumber={estimate.number}
        pending={pending}
        onSubmit={async ({ name, image }) => {
          setPending(true);
          try {
            const status = await crm.acceptEstimate(estimate.id, { name, image });
            if (!status) return;
            setSignOpen(false);
            toast.success(
              status === "accepted"
                ? "Signed. The signature is on the estimate and the PDF."
                : "Signature saved. This proposal is accepted once the other homeowner signs.",
            );
          } finally {
            setPending(false);
          }
        }}
      />
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{contract.name}</DialogTitle>
            <DialogDescription>
              Locked language from the company contract, filled with this proposal’s numbers. Payment lines take the
              amounts from the schedule.
            </DialogDescription>
          </DialogHeader>
          <DocumentTermsFields
            value={terms}
            values={estimateTermsValues({ estimate: billed, lines: scopedLines, customer, company: letterhead })}
            disabled
            emptyLabel="No terms on this contract."
            hint=""
            onCommit={() => {}}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as company template</DialogTitle>
            <DialogDescription>
              Sections, prices, options, cover note, terms, and notes are copied. The next estimate can start from
              this instead of a blank page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Hail roof — architectural shingles"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !templateName.trim()}
              onClick={() => {
                setPending(true);
                void crm
                  .saveEstimateAsTemplate(estimate.id, templateName.trim())
                  .then((template) => {
                    toast.success(`${template.name} is in company templates.`);
                    setSaveTemplateOpen(false);
                    router.push(`/estimates/templates/${template.id}`);
                  })
                  .finally(() => setPending(false));
              }}
            >
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SuffixField({
  suffix,
  className,
  children,
}: {
  suffix: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      {children}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}

function KindAmountField({
  kind,
  value,
  disabled,
  onChange,
  className,
}: {
  kind: AdjustmentKind;
  value: number;
  disabled?: boolean;
  onChange: (kind: AdjustmentKind, value: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex", className)}>
      <Select
        value={kind}
        disabled={disabled}
        onValueChange={(next) => onChange((next === "amount" ? "amount" : "percent") as AdjustmentKind, value)}
        items={[
          { value: "percent", label: "%" },
          { value: "amount", label: "$" },
        ]}
      >
        <SelectTrigger className="w-16 shrink-0 rounded-r-none border-r-0 bg-card" aria-label="Percent or dollars">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="percent">%</SelectItem>
          <SelectItem value="amount">$</SelectItem>
        </SelectContent>
      </Select>
      {kind === "amount" ? (
        <CurrencyInput
          disabled={disabled}
          className="rounded-l-none"
          value={value}
          onCommit={(text) => {
            const next = moneyAmount(text) ?? 0;
            if (next !== value) onChange(kind, next);
          }}
        />
      ) : (
        <CommitInput
          type="number"
          min={0}
          step="0.01"
          disabled={disabled}
          className="rounded-l-none"
          value={value}
          onCommit={(next) => onChange(kind, Number(next) || 0)}
        />
      )}
    </div>
  );
}
