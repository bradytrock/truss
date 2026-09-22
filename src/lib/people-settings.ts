export const PEOPLE_SETTINGS_TABS = [
  { href: "/settings/people", label: "People", id: "people" },
  { href: "/settings/people/teams", label: "Teams", id: "teams" },
  { href: "/settings/people/voice", label: "Voice", id: "voice" },
] as const;

export type PeopleSettingsTab = (typeof PEOPLE_SETTINGS_TABS)[number]["id"];

export function peopleSettingsTab(pathname: string): PeopleSettingsTab {
  if (pathname.startsWith("/settings/people/voice")) return "voice";
  if (pathname.startsWith("/settings/people/teams")) return "teams";
  return "people";
}

export function peopleSettingsTabIsActive(href: string, pathname: string) {
  if (href === "/settings/people/voice") return pathname.startsWith("/settings/people/voice");
  if (href === "/settings/people/teams") return pathname.startsWith("/settings/people/teams");
  return pathname === "/settings/people" || pathname === "/settings/people/";
}
