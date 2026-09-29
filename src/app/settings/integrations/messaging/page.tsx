"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrationSettingsChrome } from "@/components/integration-settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { useCrm } from "@/lib/crm-store";

type TextStatus = { configured?: boolean; fromNumber?: string };
type EmailStatus = { configured?: boolean; from?: string };

export default function MessagingIntegrationPage() {
  return (
    <SettingsAdminGate
      title="Messaging settings are restricted"
      description="Only a company admin can review how this office sends texts and email."
    >
      <IntegrationSettingsChrome
        title="Messaging"
        description="Texts, system email, and the mailbox linked to the seat you are using."
      >
        <MessagingIntegrationSettings />
      </IntegrationSettingsChrome>
    </SettingsAdminGate>
  );
}

function MessagingIntegrationSettings() {
  const crm = useCrm();
  const [texts, setTexts] = useState<TextStatus | null>(null);
  const [email, setEmail] = useState<EmailStatus | null>(null);
  const [oauthReady, setOauthReady] = useState(false);
  const mailbox = crm.gmailAccounts.find((account) => account.staffId === crm.user.staffId);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/share/text")
        .then((response) => response.json())
        .catch(() => ({ configured: false })),
      fetch("/api/share/email")
        .then((response) => response.json())
        .catch(() => ({ configured: false })),
      fetch("/api/google/gmail/status")
        .then((response) => response.json())
        .catch(() => ({ configured: false })),
    ]).then(([textStatus, emailStatus, gmailStatus]) => {
      if (cancelled) return;
      setTexts(textStatus as TextStatus);
      setEmail(emailStatus as EmailStatus);
      setOauthReady(Boolean((gmailStatus as { configured?: boolean }).configured));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Texts</CardTitle>
          <CardDescription>Sendblue delivers texts from the inbox and from share links.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-sm">
          {texts === null ? (
            <p className="text-muted-foreground">Checking texts…</p>
          ) : texts.configured ? (
            <p>
              Texts are connected
              {texts.fromNumber ? ` (${texts.fromNumber})` : ""}.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Texts are not connected on this host. Add the Sendblue keys, or deploy the send-text
              function, before the inbox can deliver.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>System email</CardTitle>
          <CardDescription>
            Resend sends proposals, invoices, invites, and the other email this office generates.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-sm">
          {email === null ? (
            <p className="text-muted-foreground">Checking email…</p>
          ) : email.configured ? (
            <p>System email is connected{email.from ? ` from ${email.from}` : ""}.</p>
          ) : (
            <p className="text-muted-foreground">
              Resend is not connected on this host. Proposals, invoices, and invites will not send
              until the host has a Resend key.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Mailbox</CardTitle>
          <CardDescription>
            Each person links their own Gmail. This connects the seat you are signed in as. The
            inbox uses the same link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm">
          {mailbox?.linked ? (
            <p>
              Linked as {mailbox.googleEmail}
              {mailbox.source === "demo" ? " (sample inbox)" : ""}.
            </p>
          ) : (
            <p className="text-muted-foreground">No mailbox is linked for this seat.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {mailbox?.linked ? (
              <Button type="button" variant="outline" onClick={() => void crm.disconnectGmail()}>
                Disconnect
              </Button>
            ) : oauthReady ? (
              <Button
                nativeButton={false}
                render={
                  <a href={`/api/google/gmail/connect?staffId=${encodeURIComponent(crm.user.staffId)}`} />
                }
              >
                Connect Gmail
              </Button>
            ) : (
              <Button type="button" onClick={() => void crm.loadSampleInbox()}>
                Load sample inbox
              </Button>
            )}
            {!mailbox?.linked && oauthReady ? (
              <Button type="button" variant="outline" onClick={() => void crm.loadSampleInbox()}>
                Sample inbox
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
