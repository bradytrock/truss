import { isMycrmsimConfigured, mycrmsimFromLabel, mycrmsimText } from "@/lib/mycrmsim";
import { isSendblueConfiguredLocally, sendblueStatus, sendblueText } from "@/lib/sendblue";

export type TextProviderName = "mycrmsim" | "sendblue" | "none";

export type TextProviderStatus = {
  configured: boolean;
  fromNumber: string;
  provider: TextProviderName;
};

export function activeTextProvider(): TextProviderName {
  if (isMycrmsimConfigured()) return "mycrmsim";
  if (isSendblueConfiguredLocally()) return "sendblue";
  return "none";
}

export async function textProviderStatus(): Promise<TextProviderStatus> {
  if (isMycrmsimConfigured()) {
    return {
      configured: true,
      fromNumber: mycrmsimFromLabel(),
      provider: "mycrmsim",
    };
  }
  const sendblue = await sendblueStatus();
  if (sendblue.configured) {
    return { configured: true, fromNumber: sendblue.fromNumber, provider: "sendblue" };
  }
  return { configured: false, fromNumber: "", provider: "none" };
}

export function missingTextProviderMessage() {
  return "Texts are not connected on this host. Add MYCRMSIM_LOCATION_ID (and MYCRMSIM_CHANNEL / MYCRMSIM_FROM_NUMBER) on Vercel, then point myCRMSIM’s workspace webhook at /api/messages/inbound?token=…";
}

export async function sendText(input: {
  to: string;
  content: string;
  userId?: string;
  attachments?: string[];
}) {
  if (isMycrmsimConfigured()) {
    return mycrmsimText(input);
  }
  return sendblueText({ to: input.to, content: input.content });
}
