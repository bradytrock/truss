import { formatDateTimeUtc } from "@/lib/format";
import {
  signatureEventLabel,
  signerRoleLabel,
} from "@/lib/estimate-signature-audit";
import type { EstimateSignatureEvent } from "@/lib/types";

export function SignatureCertificate({
  events,
  estimateNumber,
}: {
  events: EstimateSignatureEvent[];
  estimateNumber: string;
}) {
  const trail = events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!trail.length) return null;
  return (
    <section className="mt-8 rounded-md border bg-card px-4 py-4">
      <h3 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Signature record</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Court record for {estimateNumber}. Each homeowner used their own link. IP address and the document
        hash are stored when they sign.
      </p>
      <ol className="mt-3 grid gap-3">
        {trail.map((event) => (
          <li key={event.id} className="border-t pt-3 text-sm first:border-t-0 first:pt-0">
            <p className="font-medium">
              {signatureEventLabel(event.kind)}
              {event.signerName ? ` — ${event.signerName}` : ""}
              {event.signerRole ? ` (${signerRoleLabel(event.signerRole)})` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{formatDateTimeUtc(event.createdAt)}</p>
            <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
              {event.ipAddress ? (
                <div>
                  <dt className="inline font-medium text-foreground">IP </dt>
                  <dd className="inline font-mono">{event.ipAddress}</dd>
                </div>
              ) : event.capturedInOffice ? (
                <div>Collected in the office</div>
              ) : null}
              {event.timeZone ? (
                <div>
                  <dt className="inline font-medium text-foreground">Time zone </dt>
                  <dd className="inline">{event.timeZone}</dd>
                </div>
              ) : null}
              {event.userAgent ? (
                <div>
                  <dt className="inline font-medium text-foreground">Device </dt>
                  <dd className="inline break-all">{event.userAgent}</dd>
                </div>
              ) : null}
              {event.deliveryChannel === "sms" && event.deliveryTo ? (
                <div>
                  <dt className="inline font-medium text-foreground">Texted to </dt>
                  <dd className="inline">{event.deliveryTo}</dd>
                </div>
              ) : null}
              {event.tokenSuffix ? (
                <div>
                  <dt className="inline font-medium text-foreground">Link </dt>
                  <dd className="inline font-mono">…{event.tokenSuffix}</dd>
                </div>
              ) : null}
              {event.documentSha256 ? (
                <div>
                  <dt className="inline font-medium text-foreground">Document SHA-256 </dt>
                  <dd className="inline break-all font-mono">{event.documentSha256}</dd>
                </div>
              ) : null}
              {event.consentText ? (
                <div>
                  <dt className="inline font-medium text-foreground">Consent </dt>
                  <dd className="inline">{event.consentText}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
