/** Stable Photon iMessage add-ons: tapbacks and bubble or screen effects. */

export const IMESSAGE_TAPBACKS = [
  { emoji: "❤️", label: "Love", verb: "Loved" },
  { emoji: "👍", label: "Like", verb: "Liked" },
  { emoji: "👎", label: "Dislike", verb: "Disliked" },
  { emoji: "😂", label: "Laugh", verb: "Laughed at" },
  { emoji: "‼️", label: "Emphasize", verb: "Emphasized" },
  { emoji: "❓", label: "Question", verb: "Questioned" },
] as const;

export const IMESSAGE_EFFECTS = [
  { id: "com.apple.messages.effect.CKConfettiEffect", label: "Confetti" },
  { id: "com.apple.messages.effect.CKBalloonEffect", label: "Balloons" },
  { id: "com.apple.messages.effect.CKLasersEffect", label: "Lasers" },
  { id: "com.apple.messages.effect.CKFireworksEffect", label: "Fireworks" },
  { id: "com.apple.messages.effect.CKSparklesEffect", label: "Sparkles" },
  { id: "com.apple.messages.effect.CKSpotlightEffect", label: "Spotlight" },
  { id: "com.apple.messages.effect.CKHeartEffect", label: "Heart" },
  { id: "com.apple.messages.effect.CKEchoEffect", label: "Echo" },
  { id: "com.apple.messages.effect.CKHappyBirthdayEffect", label: "Celebration" },
  { id: "com.apple.MobileSMS.expressivesend.impact", label: "Slam" },
  { id: "com.apple.MobileSMS.expressivesend.loud", label: "Loud" },
  { id: "com.apple.MobileSMS.expressivesend.gentle", label: "Gentle" },
  { id: "com.apple.MobileSMS.expressivesend.invisibleink", label: "Invisible ink" },
] as const;

const TAPBACK_VERBS = new Map<string, string>([
  ...IMESSAGE_TAPBACKS.map((item) => [item.emoji, item.verb] as const),
  ["❤", "Loved"],
  ["❗", "Emphasized"],
]);

export function imessageTapbackVerb(emoji: string) {
  return TAPBACK_VERBS.get(emoji.trim()) ?? "";
}

export function imessageEffectLabel(value: string) {
  const raw = value.trim();
  const found = IMESSAGE_EFFECTS.find(
    (item) => item.id === raw || item.label.toLowerCase() === raw.toLowerCase(),
  );
  if (found) return found.label;
  if (!raw) return "Effect";
  const tail = raw.split(".").pop() ?? raw;
  const words = tail.replace(/^CK/, "").replace(/Effect$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words || "Effect";
}

export function imessageEffectId(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  return (
    IMESSAGE_EFFECTS.find((item) => item.id === raw || item.label.toLowerCase() === raw.toLowerCase())?.id ?? ""
  );
}

/** Words written into the thread for a tapback, including the quoted preview. */
export function imessageReactionText(emoji: string, preview: string) {
  const verb = imessageTapbackVerb(emoji);
  const text = preview.trim().replace(/\s+/g, " ").slice(0, 160);
  const quoted = text ? `“${text}”` : "";
  if (verb && quoted) return { body: `${verb} ${quoted}`, detail: verb };
  if (verb) return { body: `${verb} a message`, detail: verb };
  if (emoji && quoted) return { body: `Reacted ${emoji} to ${quoted}`, detail: emoji };
  if (emoji) return { body: `Reacted ${emoji}`, detail: emoji };
  return { body: "Reacted to a message", detail: "Reaction" };
}
