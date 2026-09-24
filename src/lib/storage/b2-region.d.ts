export const DEFAULT_B2_REGION: string;

export function regionFromB2KeyId(keyId: string): string;

export function resolveB2Location(input?: {
  keyId?: string;
  region?: string;
  endpoint?: string;
}): { region: string; endpoint: string };
