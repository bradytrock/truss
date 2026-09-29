export const INTEGRATION_SETTINGS_TABS = [
  { href: "/settings/integrations/eagleview", label: "EagleView", id: "eagleview", admin: true },
  { href: "/settings/integrations/companycam", label: "CompanyCam", id: "companycam", admin: true },
  { href: "/settings/integrations/stripe", label: "Stripe", id: "stripe", admin: true },
  { href: "/settings/integrations/messaging", label: "Messaging", id: "messaging", admin: true },
  { href: "/settings/integrations/quickbooks", label: "QuickBooks", id: "quickbooks", admin: false },
] as const;

export type IntegrationSettingsTab = (typeof INTEGRATION_SETTINGS_TABS)[number]["id"];

export function integrationSettingsTabs(admin: boolean) {
  return INTEGRATION_SETTINGS_TABS.filter((tab) => admin || !tab.admin);
}

export function integrationSettingsHome(admin: boolean) {
  return admin ? "/settings/integrations/eagleview" : "/settings/integrations/quickbooks";
}

export function integrationSettingsTabIsActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
