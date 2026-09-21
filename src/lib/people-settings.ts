export const PEOPLE_SETTINGS_TABS = [
  { href: "/settings/people", label: "People", id: "people" },
  { href: "/settings/people/teams", label: "Teams", id: "teams" },
] as const;

export type PeopleSettingsTab = (typeof PEOPLE_SETTINGS_TABS)[number]["id"];

export function peopleSettingsTab(pathname: string): PeopleSettingsTab {
  return pathname.startsWith("/settings/people/teams") ? "teams" : "people";
}

export function peopleSettingsTabIsActive(href: string, pathname: string) {
  if (href === "/settings/people/teams") return pathname.startsWith("/settings/people/teams");
  return pathname === "/settings/people" || pathname === "/settings/people/";
}
